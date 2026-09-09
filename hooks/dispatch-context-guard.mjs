// A PreToolUse gate. SubagentStart cannot prevent dispatch in Codex.
import {manifestAt} from './policy-manifest.mjs';
import {actorIdentity} from './operation.mjs';
import {checkDispatch} from '../scripts/dispatch-plan.mjs';
export function evalDispatchContext(j,host='claude',root=j.cwd) {
  if(!/^(?:Task|Agent|spawn_agent|send_input)$/i.test(String(j.tool_name)))return null;
  if (actorIdentity(j).worker) return {kind:'block',label:'DISPATCH CONTEXT',why:'A worker cannot recursively dispatch another agent. Return the required additional work to the controller.'};
  if (manifestAt(root)?.dispatchContext !== 'required' && !String(j.tool_input?.prompt??j.tool_input?.message??'').startsWith('EIDOLON_DISPATCH_V1\n')) return null;
  try {checkDispatch(j.tool_input?.prompt??j.tool_input?.message??'',root,host);return null;}
  catch {return {kind:'block',label:'DISPATCH CONTEXT',why:'Missing, stale, or invalid task/persona/context packet. Build a bounded brief with scripts/dispatch-plan.mjs, resolve pending questions, and retain host permission checks. No payload values were logged.'};}
}
