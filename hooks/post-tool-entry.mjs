// Committed state follows an observed successful host result, never preflight.
try {
  const {runHook} = await import('./lib.mjs');
  const {commitDrift} = await import('./drift-guard.mjs');
  runHook(j => {
    try { commitDrift(j, 'claude'); }
    catch { process.stdout.write(JSON.stringify({systemMessage:'Eidolon outcome state needs operator reconciliation. The completed operation was not undone; no successful bookkeeping is claimed.'})); }
  }, {enforcement:false});
} catch { process.stderr.write('EIDOLON OUTCOME: bookkeeping unavailable; no state update claimed.\n'); }
