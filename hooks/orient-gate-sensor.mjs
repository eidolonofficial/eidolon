// hooks/orient-gate-sensor.mjs
//
// PostToolUse(Read|Bash|Skill) -- the ORIENT-GATE sensor. Silent: it records when a
// Read of the code graph, a `graphify query/path/explain`, or a `mempalace search`
// happened this session, into the session-keyed sentinel (.claude/.orient-gate.json)
// that the PreToolUse orient-gate reads. It never speaks and never blocks (a PostToolUse
// hook cannot block anyway); it only writes the sentinel via recordRead, which no-ops
// once a flag is set for the session. Fail-open via runHook -- a bad payload or
// unwritable sentinel never bricks the workflow.
import { runHook } from "./lib.mjs";
import { recordRead } from "./orient-gate-core.mjs";

runHook((j) => { recordRead(String(j.cwd || process.cwd()), j); }, {enforcement:false});
