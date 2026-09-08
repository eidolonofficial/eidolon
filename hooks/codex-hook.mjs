// Codex lifecycle adapter. Policy evaluators are shared with Claude; wire format is not.
// Source contract: https://learn.chatgpt.com/docs/hooks (checked 2026-09-08).
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { bashEvaluators, writeEvaluators } from './suite-evaluators.mjs';
import { evalAppendOnlyRecord } from './append-only-record-guard.mjs';
import { evalDispatchAttestation } from './dispatch-attestation-guard.mjs';
import { evalGate, recordRead, repoRoot } from './orient-gate-core.mjs';
import { parsePatch, confinedPath } from './codex-patch.mjs';

const deny = why => ({ kind: 'block', label: 'CODEX ADAPTER', why });
const immutable = /^(?:\.git(?:\/|$)|\.codex\/(?:hooks\.json|config\.toml|rules(?:\/|$))|\.(?:agents|claude)\/skills\/eidolon(?:\/|$)|hooks\/(?:codex-[^/]+|suite-evaluators\.mjs|lib\.mjs)$)/i;
const slash = path => path.replace(/\\/g, '/');
const quote = value => "'" + value.replace(/'/g, "'\\''") + "'";

function orientationRequired(root) {
  // Preserve an existing orientation gate; do not require optional services on a fresh install.
  return ['.claude/eidolon-manifest.yaml', '.claude/settings.json'].some(name => {
    try { return readFileSync(join(root, name), 'utf8').includes('orient-gate.mjs'); }
    catch { return false; }
  });
}
function checkEvent(j, root) {
  if (!j || Array.isArray(j) || typeof j !== 'object') throw Error('Expected an event object');
  if (typeof j.cwd !== 'string' || !j.cwd) throw Error('Missing event working directory');
  const cwd = realpathSync(j.cwd);
  root = realpathSync(root || repoRoot(cwd));
  if (cwd !== root) confinedPath(root, root, cwd);
  // Shared legacy state stays in .claude so existing personas and attestations still apply.
  for (const path of ['.claude/.drift-count', '.claude/active-persona.json', '.claude/eidolon-manifest.yaml']) {
    confinedPath(root, root, path);
  }
  return { cwd, root };
}

export function evaluateCodex(j, project) {
  const { cwd, root } = checkEvent(j, project);
  if (typeof j.tool_name !== 'string' || !j.tool_input || Array.isArray(j.tool_input) || typeof j.tool_input !== 'object') {
    throw Error('Invalid tool event');
  }
  const base = { ...j, cwd: root };
  const verdicts = [];
  const run = (evaluators, event) => {
    for (const evaluate of evaluators) {
      const verdict = evaluate(event);
      if (verdict) verdicts.push(verdict);
      if (verdict?.kind === 'block') return false;
    }
    return true;
  };
  const gate = event => !orientationRequired(root) || run([evalGate], event);
  const protect = path => {
    if (immutable.test(slash(relative(root, path)))) {
      verdicts.push(deny('This changes agent configuration or the installed guard runtime. Review and apply this maintenance outside the agent; do not disable the hooks.'));
      return false;
    }
    return true;
  };
  if (j.tool_name === 'Bash') {
    if (typeof j.tool_input.command !== 'string') throw Error('Bash requires command text');
    const command = j.tool_input.command;
    // A narrow extra net for the new Codex control paths. Not a shell security parser.
    if (/\.(?:codex|agents)[\\/]/i.test(command) && /(?:>|\b(?:rm|mv|cp|tee|sed|Set-Content|Add-Content|Remove-Item|Move-Item)\b)/i.test(command)) {
      return [deny('Shell mutation of Codex configuration or skills requires a reviewed maintenance operation outside the agent.')];
    }
    for (const evaluate of bashEvaluators) {
      const event = evaluate.name === 'evalVerification' || evaluate.name === 'evalConduct' ? { ...base, cwd } : base;
      if (!run([evaluate], event)) break;
    }
  } else if (j.tool_name === 'apply_patch') {
    for (const change of parsePatch(j.tool_input.command, cwd, root)) {
      if (!protect(change.path) || !protect(change.destination || change.path)) break;
      const target = change.destination || change.path;
      const event = { ...base, tool_name: 'Write', tool_input: { file_path: target, content: change.after } };
      if (!gate(event)) break;
      if (change.kind === 'delete' || change.kind === 'move') {
        const command = change.kind === 'delete' ? `rm -- ${quote(change.path)}` : `mv -- ${quote(change.path)} ${quote(target)}`;
        if (!run(bashEvaluators, { ...base, tool_name: 'Bash', tool_input: { command } })) break;
        if (change.kind === 'move' && !run([evalAppendOnlyRecord], { ...base, tool_name: 'Write', tool_input: { file_path: change.path, content: '' } })) break;
      }
      // Check removed spans as Edit too: a small deletion must not hide in a large replacement.
      let spansPass = true;
      for (const edit of change.edits) {
        if (!run([evalAppendOnlyRecord], { ...base, tool_name: 'Edit', tool_input: { file_path: target, ...edit } })) { spansPass = false; break; }
      }
      if (!spansPass || !run(writeEvaluators, event)) break;
    }
  } else if (/^(spawn_agent|send_input|Task|Agent)$/i.test(j.tool_name)) {
    const ti = j.tool_input;
    const event = { ...base, tool_name: 'Task', tool_input: { ...ti,
      prompt: ti.message ?? ti.prompt ?? ti.task ?? '', subagent_type: ti.agent_type ?? ti.subagent_type ?? '' } };
    if (gate(event)) run([evalDispatchAttestation], event);
  } else if (/^(Write|Edit)$/i.test(j.tool_name)) {
    const path = confinedPath(root, cwd, j.tool_input.file_path || j.tool_input.path);
    const event = { ...base, tool_name: /^write$/i.test(j.tool_name) ? 'Write' : 'Edit', tool_input: { ...j.tool_input, file_path: path } };
    if (protect(path) && gate(event)) run(writeEvaluators, event);
  } else if (/advisor/i.test(j.tool_name)) {
    // Advisor access cannot be attributed safely using an unverified subagent marker.
    verdicts.push(deny('Advisor calls require controller review; the Codex adapter does not infer controller identity from model-supplied fields.'));
  }
  return verdicts;
}

export function codexOutput(verdicts) {
  const blocked = verdicts.filter(v => v.kind === 'block' || v.kind === 'ask');
  if (blocked.length) {
    // Codex currently fails open on permissionDecision:"ask". Never emit it here.
    const needsHuman = blocked.some(v => v.kind === 'ask');
    return { status: 2, stderr: blocked.map(v => `${v.label}: ${v.why}`).join('\n') +
      (needsHuman ? '\nMANUAL REVIEW REQUIRED: Codex cannot pause this call with a native ask verdict. The operation remains blocked. Do not retry, manufacture an approval file, or disable hooks. Have the operator review and perform this exact operation in their own terminal, or satisfy the documented evidence/attestation prerequisite before retrying.\n' : '\n'), stdout: '' };
  }
  const message = verdicts.map(v => `${v.label}: ${v.why}`).join('\n');
  return { status: 0, stderr: '', stdout: message ? JSON.stringify({ hookSpecificOutput: {
    hookEventName: 'PreToolUse', additionalContext: message } }) : '' };
}

function snapshotPath(root, sid) {
  if (typeof sid !== 'string' || !sid) throw Error('Missing session id');
  return confinedPath(root, root, '.eidolon/sessions/' + createHash('sha256').update(sid).digest('hex') + '.json');
}
function git(root, args) {
  try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 }).trim(); }
  catch { return ''; }
}
export function lifecycle(j, project) {
  const { root } = checkEvent(j, project);
  if (j.hook_event_name === 'PreToolUse') return codexOutput(evaluateCodex(j, root));
  if (j.hook_event_name === 'PostToolUse') {
    const response = j.tool_response;
    if (response && typeof response === 'object' && (response.isError || response.exit_code > 0 || response.exitCode > 0)) return codexOutput([]);
    if (orientationRequired(root)) {
      confinedPath(root, root, '.claude/.orient-gate.' + String(j.session_id || '').replace(/[^A-Za-z0-9_-]/g, '') + '.json');
      mkdirSync(join(root, '.claude'), { recursive: true }); recordRead(root, { ...j, cwd: root });
    }
    return codexOutput([]);
  }
  if (j.hook_event_name === 'PreCompact') {
    const path = snapshotPath(root, j.session_id); mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ savedAt: new Date().toISOString(), head: git(root, ['rev-parse', 'HEAD']),
      branch: git(root, ['branch', '--show-current']), changedFiles: git(root, ['status', '--porcelain']).split('\n').filter(Boolean).length }));
    return codexOutput([]);
  }
  if (j.hook_event_name === 'SessionStart') {
    let snapshot = '';
    const path = snapshotPath(root, j.session_id);
    if (existsSync(path)) snapshot = '\nSaved facts (a hypothesis, not current truth): ' + readFileSync(path, 'utf8').slice(0, 3000);
    const message = 'Eidolon Codex adapter loaded. Read AGENTS.md and the Eidolon skill. Hook-based ask decisions remain blocked for manual operator review. Existing persona and attestation state is shared under .claude; no guard may be bypassed.' + snapshot;
    return { status: 0, stderr: '', stdout: JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: message } }) };
  }
  return codexOutput([]);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let raw = '', oversized = false;
  process.stdin.on('data', chunk => { if (Buffer.byteLength(raw) + chunk.length > 5 * 1024 * 1024) oversized = true; else raw += chunk; });
  process.stdin.on('end', () => {
    try {
      if (oversized) throw Error('Event exceeds input limit');
      const j = JSON.parse(raw.replace(/^\uFEFF/, ''));
      const at = process.argv.indexOf('--project');
      const result = lifecycle(j, at < 0 ? undefined : process.argv[at + 1]);
      process.stdout.write(result.stdout); process.stderr.write(result.stderr); process.exitCode = result.status;
    } catch {
      // Do not echo the payload: it may contain credentials or private source.
      process.stderr.write('EIDOLON CODEX ADAPTER: validation failed; tool call blocked. Check event format, patch context and project paths. No input values were logged.\n');
      process.exitCode = 2;
    }
  });
}
