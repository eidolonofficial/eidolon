// Catch adapter loading failures too: Codex must receive exit 2, not a fail-open exit 1.
let raw = '', oversized = false;
process.stdin.on('data', chunk => {
  if (Buffer.byteLength(raw) + chunk.length > 5 * 1024 * 1024) oversized = true;
  else raw += chunk;
});
process.stdin.on('end', async () => {
  try {
    if (oversized) throw Error('Input limit');
    const { lifecycle } = await import('./codex-hook.mjs');
    const event = JSON.parse(raw.replace(/^\uFEFF/, ''));
    const at = process.argv.indexOf('--project');
    const out = lifecycle(event, at < 0 ? undefined : process.argv[at + 1]);
    process.stdout.write(out.stdout); process.stderr.write(out.stderr); process.exitCode = out.status;
  } catch {
    process.stderr.write('EIDOLON CODEX: adapter unavailable or invalid event; tool call blocked. Check installation and event format. No input values were logged.\n');
    process.exitCode = 2;
  }
});
