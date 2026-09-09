// Shared, bounded host/file normalization. Never executes a proposed command.
import { existsSync, readFileSync, statSync, realpathSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { confinedPath } from './codex-patch.mjs';
export const SHELL_TOOLS = ['Bash', 'PowerShell'];
export const DISPATCH_TOOLS = ['Task', 'Agent', 'spawn_agent', 'send_input'];
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const isShell = name => SHELL_TOOLS.some(n => n.toLowerCase() === String(name || '').toLowerCase());
export const isDispatch = name => DISPATCH_TOOLS.some(n => n.toLowerCase() === String(name || '').toLowerCase());
export function normalizeEvent(raw, project) {
  if (!raw || Array.isArray(raw) || typeof raw !== 'object') throw Error('Invalid event');
  if (raw.tool_input != null && (Array.isArray(raw.tool_input) || typeof raw.tool_input !== 'object')) throw Error('Invalid tool input');
  const cwdAlias=resolve(raw.cwd||process.cwd()),rootAlias=resolve(project||cwdAlias);
  const cwd=realpathSync(cwdAlias),root=realpathSync(rootAlias);
  if (cwd !== root) confinedPath(root, root, cwd);
  const j = {...raw, cwd, eidolon_root: root, eidolon_path_root:rootAlias, eidolon_path_cwd:cwdAlias};
  delete j.eidolon_changes;
  delete j.eidolon_dispatch_packet;
  if (isShell(raw.tool_name)) {
    j.original_tool_name = raw.tool_name;
    j.shell_language = /^powershell$/i.test(raw.tool_name) ? 'powershell' : 'bash';
    j.tool_name = 'Bash';
  }
  return j;
}
export function policyRoot(j) { return resolve(j.eidolon_root || j.cwd || process.cwd()); }
export function boundedRead(path, max = MAX_FILE_BYTES) {
  if (statSync(path).size > max) throw Error('File exceeds policy input limit');
  const bytes = readFileSync(path);
  if (bytes.length > max) throw Error('File exceeds policy input limit');
  return bytes;
}
export function proposedFile(j) {
  const ti = j.tool_input || {};
  if (!['Write', 'Edit'].includes(j.tool_name)) throw Error('Unsupported file operation');
  const given = ti.file_path ?? ti.path;
  if (typeof given !== 'string' || !given) throw Error('Missing file path');
  const root = policyRoot(j);
  const path = confinedPath(j.eidolon_path_root||root, j.eidolon_path_cwd||j.cwd||root, given);
  const present = existsSync(path);
  const before = present ? boundedRead(path) : Buffer.alloc(0);
  let after;
  if (j.tool_name === 'Write') {
    if (typeof ti.content !== 'string') throw Error('Write requires content');
    after = Buffer.from(ti.content, 'utf8');
  } else {
    if (!present || typeof ti.old_string !== 'string' || !ti.old_string || typeof ti.new_string !== 'string') throw Error('Edit requires exact existing text');
    if (ti.replace_all != null && typeof ti.replace_all !== 'boolean') throw Error('Invalid replace_all');
    const old = new TextDecoder('utf-8', {fatal: true}).decode(before);
    const pieces = old.split(ti.old_string);
    const count = pieces.length - 1;
    if (count === 0 || (count > 1 && ti.replace_all !== true)) throw Error('Ambiguous or missing edit context');
    after = Buffer.from(ti.replace_all === true ? pieces.join(ti.new_string) : old.replace(ti.old_string, () => ti.new_string), 'utf8');
  }
  if (after.length > MAX_FILE_BYTES) throw Error('Proposed file exceeds limit');
  return {root, path, present, before, after, beforeSha256: sha256(before)};
}
export function actorIdentity(j) {
  const session = typeof j.session_id === 'string' && j.session_id ? j.session_id : 'legacy';
  const explicit = typeof j.agent_id === 'string' && j.agent_id ? j.agent_id : null;
  // Path detection is a conservative legacy fallback, never proof of controller authority.
  const legacyWorker = /[\\/]subagents[\\/]/i.test(String(j.transcript_path || ''));
  const worker = explicit !== null || legacyWorker;
  return {session, actor: explicit || (legacyWorker ? 'unknown-worker' : 'controller'), worker, explicit: explicit !== null};
}
export function actorPath(j, name) {
  if (!/^[a-z-]+\.json$/.test(name)) throw Error('Invalid actor state name');
  const who = actorIdentity(j), root = policyRoot(j);
  return confinedPath(root, root, '.eidolon/sessions/' + sha256(who.session) + '/actors/' + sha256(who.actor) + '/' + name);
}

export function fileTarget(j) {
  const root=policyRoot(j), given=j.tool_input?.file_path ?? j.tool_input?.path;
  return confinedPath(j.eidolon_path_root||root,j.eidolon_path_cwd||j.cwd||root,given);
}
