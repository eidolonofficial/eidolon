// Preserve the complete historical byte prefix, not only a size heuristic.
import {runHook, emitVerdict} from './lib.mjs';
import {relative, posix} from 'node:path';
import {proposedFile, fileTarget, policyRoot, outsideRoot} from './operation.mjs';
const RECORD = /(?:^|[\/\\])docs[\/\\](?:fixes|insights|decisions)[\/\\]|(?:^|[\/\\])DECISIONS?\.md$/i;
// The record test runs on the resolved path, so "docs/./decisions/x.md" and "docs//decisions/x.md"
// are the record. A path that cannot be confined falls back to its normalized spelling.
function recordPath(j) {
  try { return relative(policyRoot(j), fileTarget(j)); }
  catch { return posix.normalize(String(j.tool_input?.file_path || j.tool_input?.path || '').replace(/\\/g, '/')); }
}
export function evalAppendOnlyRecord(j) {
  if (!['Write','Edit'].includes(j.tool_name) || outsideRoot(j)) return null;
  if (!RECORD.test(recordPath(j))) return null;
  const block = why => ({kind:'block',label:'APPEND-ONLY RECORD GUARD',why});
  try {
    const {before,after,present} = proposedFile(j);
    if (!present) return null;
    if (after.length < before.length || !after.subarray(0,before.length).equals(before))
      return block('This changes existing historical record bytes. Append a correction or a superseding entry; retire stale guidance in the active index. Record removal is separate operator-reviewed maintenance.');
    return null;
  } catch {
    return block('The complete proposed record could not be validated. Check its exact edit context and encoding. No event contents were logged.');
  }
}
if (process.argv[1]?.replace(/\\/g,'/').endsWith('/append-only-record-guard.mjs')) runHook(j=>emitVerdict(evalAppendOnlyRecord(j)));
