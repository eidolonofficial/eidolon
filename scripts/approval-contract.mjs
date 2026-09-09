// Shared intent is not host wire syntax. No capability flag can enable unsupported Codex ask.
export function permissionDecision(verdicts) {
  if(!Array.isArray(verdicts))throw Error('Invalid verdicts');
  if(verdicts.some(v=>v.kind==='block'))return 'deny';
  if(verdicts.some(v=>v.kind==='ask'))return 'ask';
  return null;
}
export function approvalOutput(host,event,decision,reason='Human approval required') {
  if(!['deny','ask',null].includes(decision))throw Error('Invalid policy decision');
  if(decision===null)return {status:0,stdout:'',stderr:''};
  if(host==='codex'&&event==='PermissionRequest') {
    // The host is ALREADY asking. No decision keeps its native prompt, never auto-approves.
    if(decision==='ask')return {status:0,stdout:'',stderr:''};
    return {status:0,stdout:JSON.stringify({hookSpecificOutput:{hookEventName:event,decision:{behavior:'deny',message:reason}}}),stderr:''};
  }
  if(host==='claude'&&event==='PreToolUse')return {status:0,stdout:JSON.stringify({hookSpecificOutput:{hookEventName:event,permissionDecision:decision,permissionDecisionReason:reason}}),stderr:''};
  // PreToolUse in Codex does not support permissionDecision:"ask"; it would fail open.
  return {status:2,stdout:'',stderr:reason+'\n'+(decision==='ask'?'MANUAL REVIEW REQUIRED: the host cannot originate this approval through PreToolUse. Operation stays blocked; do not manufacture a receipt or disable hooks.\n':'')};
}
