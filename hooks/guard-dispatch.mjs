// Required dispatch modules are loaded inside the fail-closed boundary.
try {
  const {runHook, runSuite} = await import('./lib.mjs');
  const {evalDispatchAttestation} = await import('./dispatch-attestation-guard.mjs');
  const {evalDispatchContext} = await import('./dispatch-context-guard.mjs');
  const {evalManagedState} = await import('./policy-manifest.mjs');
  runSuite([evalManagedState, j => evalDispatchContext(j, 'claude', j.eidolon_root), evalDispatchAttestation]);
} catch {
  process.stderr.write('EIDOLON DISPATCH: required runtime unavailable; operation blocked. No payload was logged.\n');
  process.exitCode = 2;
}
