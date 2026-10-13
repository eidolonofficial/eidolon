// PreToolUse(Agent|Task): a worker may not dispatch (block). A sensitive dispatch, a write-capable brief with no
// done-check, and a missing wave plan ask the human; every dispatch is logged (hooks/dispatch-evaluators.mjs).
// Awareness is a soft layer, so everything but recursion asks (policy: references/security-policy.md).
// ponytail: keyword match on the dispatch text; upgrade path is a risk field on the brief.
try {
  const {runSuite} = await import('./lib.mjs');
  const {isDispatch} = await import('./operation.mjs');
  const {evalManagedState} = await import('./policy-manifest.mjs');
  const {evalWorkerRecursion, evalBriefGate, evalWavePlan, evalModelTier, evalDispatchLog} = await import('./dispatch-evaluators.mjs');
  // Regex literals: in a plain string literal, \b becomes a backspace and \s becomes 's'.
  const SENSITIVE = new RegExp([
    /security/, /trust[ -]?safety/, /red[ -]?team/, /blue[ -]?team/,
    /deploy/, /release/, /publish/, /rollout/, /production/, /\bprod\b/,
    /migrat/, /\bpii\b/, /personal data/, /payment/, /cardholder/, /\bpci\b/,
    /credential/, /secret/, /\btoken\b/, /\bkeys?\b/, /\.env\b/,
    /destructive/, /rm\s+-rf/, /drop\s+(?:table|database)/, /truncate/, /\bdelete\b/,
    /\bwipe\b/, /\bdestroy\b/, /irreversible/, /force[ -]?push/,
  ].map(r => r.source).join('|'), 'i');
  const evalSensitiveDispatch = j => {
    if (!isDispatch(j.tool_name)) return null;
    const ti = j.tool_input || {};
    const text = [ti.description, ti.prompt, ti.message, ti.subagent_type, ti.agent_type, ti.task]
      .filter(x => typeof x === 'string').join('\n');
    if (!SENSITIVE.test(text)) return null;
    return {kind: 'ask', label: 'SENSITIVE DISPATCH',
      why: 'this dispatch looks destructive or sensitive. Confirm you intend to dispatch it now; see references/security-policy.md.'};
  };
  runSuite([evalManagedState, evalSensitiveDispatch, evalWorkerRecursion, evalBriefGate, evalWavePlan, evalModelTier, evalDispatchLog]);
} catch {
  process.stderr.write('EIDOLON DISPATCH: required runtime unavailable; operation blocked. No payload was logged.\n');
  process.exitCode = 2;
}
