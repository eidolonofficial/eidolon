// Claude PreToolUse(Bash): ordering and output contract are unchanged.
import { runSuite } from './lib.mjs';
import { bashEvaluators } from './suite-evaluators.mjs';
runSuite(bashEvaluators);
