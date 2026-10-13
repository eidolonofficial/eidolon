// PreToolUse(Agent|Task) evaluators and the dispatch log shared with SubagentStart/SubagentStop.
// guard-dispatch.mjs runs them in order; each is pure except evalDispatchLog, which appends one line.
import {appendFileSync, mkdirSync, readdirSync, readFileSync, statSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {actorIdentity, isDispatch, policyRoot, sha256} from './operation.mjs';
import {scopeOf} from './lanes.mjs';

// A done-check is a line of its own that starts with the label and carries text; a keyword in prose is not one.
const DONE_CHECK = /^[ \t]*(?:[-*>][ \t]+)?(?:done-check|acceptance)[ \t]*:[ \t]*(\S.*)$/gim;
// A value that only says there is no check.
const PLACEHOLDER = /^(?:none|n\/a|na|tbd|todo|skip|-+)[.!]*$/i;
const hasDoneCheck = prompt => [...prompt.matchAll(DONE_CHECK)].some(m => !PLACEHOLDER.test(m[1].trim()));
const READ_ONLY_TYPE = /^(?:Explore|Plan|(?:caveman:)?cavecrew-investigator|(?:caveman:)?cavecrew-reviewer)$/;
const WAVE_MIN_CHARS = 20;

export const logPath = root => join(root, '.claude', '.dispatch-log.jsonl');
export function appendLog(root, entry) {
  try {
    mkdirSync(join(root, '.claude'), {recursive: true});
    appendFileSync(logPath(root), JSON.stringify(entry) + '\n');
  } catch { /* a log failure never fails a hook */ }
}
export function readLog(root) {
  try {
    return readFileSync(logPath(root), 'utf8').split('\n').flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
  } catch { return []; }
}

// An agent-scopes entry decides; without one, only the known read-only types are exempt.
function writeCapable(root, ti) {
  const type = typeof ti.subagent_type === 'string' ? ti.subagent_type : '';
  const scope = scopeOf(root, type);
  return scope ? Array.isArray(scope.write) && scope.write.length > 0 : !READ_ONLY_TYPE.test(type);
}
// The host requires a prompt on every dispatch, so a payload without one is not a brief to judge.
const brief = j => isDispatch(j.tool_name) && typeof j.tool_input?.prompt === 'string' && writeCapable(policyRoot(j), j.tool_input) ? j.tool_input : null;

// The tier a dispatch runs at (conductor-standard section 4): the model named on the call, else the model line of
// the agent file (.claude/agents/<type>.md in the project, then in the home directory), else a plugin agent's own
// definition. A dispatch that names none is asked to choose, so every tier is a decision and lands in the log.
function agentFileModel(root, type) {
  if (typeof type !== 'string' || !/^[A-Za-z0-9_-]+$/.test(type)) return null;
  for (const dir of [join(root, '.claude', 'agents'), join(homedir(), '.claude', 'agents')]) {
    try {
      const head = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(join(dir, type + '.md'), 'utf8'));
      const model = head && /^model:[ \t]*(\S+)/m.exec(head[1]);
      if (model) return model[1];
    } catch { /* no agent file here */ }
  }
  return null;
}
export function tierOf(root, ti) {
  if (typeof ti.model === 'string' && ti.model.trim()) return ti.model.trim();
  if (typeof ti.subagent_type === 'string' && ti.subagent_type.includes(':')) return 'plugin-defined';
  return agentFileModel(root, ti.subagent_type);
}
export function evalModelTier(j) {
  if (!isDispatch(j.tool_name) || typeof j.tool_input?.prompt !== 'string') return null;
  if (tierOf(policyRoot(j), j.tool_input)) return null;
  return {kind: 'ask', label: 'DISPATCH GUARD', why: 'no model tier: set model on the call (opus for judgment on risky code, sonnet for build and research, haiku for mechanical work) or give the agent file a model line (conductor-standard section 4)'};
}

export function evalWorkerRecursion(j) {
  if (!isDispatch(j.tool_name) || !actorIdentity(j).worker) return null;
  return {kind: 'block', label: 'DISPATCH GUARD', why: 'a worker may not dispatch. Return the need to the controller.'};
}

export function evalBriefGate(j) {
  const ti = brief(j);
  if (!ti || hasDoneCheck(ti.prompt)) return null;
  return {kind: 'ask', label: 'DISPATCH GUARD', why: 'brief names no done-check. Add a line such as "Done-check: <command> exits 0".'};
}

// null when the session start cannot be read: the plan cannot then be matched to this session.
function sessionStart(j) {
  try { const s = statSync(j.transcript_path); return s.birthtimeMs || s.ctimeMs; }
  catch { return null; }
}
export function evalWavePlan(j) {
  if (!brief(j)) return null;
  const dir = join(policyRoot(j), '.claude', 'waves');
  const start = sessionStart(j);
  if (start === null) return {kind: 'ask', label: 'DISPATCH GUARD', why: 'no wave plan can be matched to this session (no readable transcript_path); write .claude/waves/<date>-<slug>.md'};
  let newest = 0;
  try {
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.md')) continue;
      const file = join(dir, name);
      if (readFileSync(file, 'utf8').replace(/\s/g, '').length >= WAVE_MIN_CHARS) newest = Math.max(newest, statSync(file).mtimeMs);
    }
  } catch { /* no waves directory */ }
  if (newest >= start) return null;
  return {kind: 'ask', label: 'DISPATCH GUARD', why: 'no wave plan for this session; write .claude/waves/<date>-<slug>.md'};
}

export function evalDispatchLog(j) {
  if (!isDispatch(j.tool_name)) return null;
  const root = policyRoot(j), ti = j.tool_input || {}, prompt = typeof ti.prompt === 'string' ? ti.prompt : null;
  appendLog(root, {
    kind: 'dispatch', ts: new Date().toISOString(), session_id: j.session_id ?? null,
    agent_type: ti.subagent_type ?? null, model: tierOf(root, ti), effort: ti.effort ?? null, description: ti.description ?? null,
    persona: /\b(?:persona|seat):[ \t]*([^\s,;]+)/i.exec(prompt ?? '')?.[1] ?? null,
    write: scopeOf(root, ti.subagent_type)?.write ?? null,
    prompt_sha256: prompt === null ? null : sha256(prompt),
  });
  return null;
}
