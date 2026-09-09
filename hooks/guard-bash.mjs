// Catch required module failures before evaluating any proposed operation.
try {
  const {runSuite} = await import('./lib.mjs');
  const {bashEvaluators} = await import('./suite-evaluators.mjs');
  runSuite(bashEvaluators);
} catch {
  process.stderr.write('EIDOLON POLICY: required runtime unavailable; operation blocked. No payload was logged.\n');
  process.exitCode = 2;
}
