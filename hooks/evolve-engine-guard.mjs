// Consent for an exact, explicitly trusted-local engine plan; not an OS sandbox.
// Host ask support is transport-specific. Malformed commands fail closed.
import { runHook, emitVerdict } from "./lib.mjs";
import {isShell} from "./operation.mjs";
import {shellCommands} from "./shell-operation.mjs";

export function evalEvolveEngine(j = {}) {
  if (j.tool_name && !isShell(j.tool_name)) return null;
  const cmd = String((j.tool_input || {}).command || "");
  const language=j.shell_language||(/^PowerShell$/i.test(j.tool_name)?'powershell':'bash');
  let confirm=false;
  try {
    confirm=shellCommands(cmd,language).some(({words})=>words.some(w=>/(?:^|[\\/])evolve-brief$/.test(w))&&words.some((w,i)=>{
      const value=w==='--confirmed'?words[i+1]:w.startsWith('--confirmed=')?w.slice(12):'';
      return /^(?:true|yes|y|1)$/i.test(value||'');
    }));
  } catch {return {kind:'block',label:'EVOLVE ENGINE GATE',why:'Unable to inspect the engine approval command; use a supported exact command.'};}
  if (confirm) {
    return {
      kind: "ask",
      label: "EVOLVE ENGINE GATE",
      why:
        "this confirms an ASI-Evolve preflight run spec (evolve-brief --confirmed true), which " +
        "unlocks the mutate/evaluate round loop: from here the engine writes candidate code into " +
        "the approved mutation scope and runs the evaluator on a real compute budget. Confirm the " +
        "exact plan digest, trusted-local code execution, core score, evaluator timeout, writable paths, and round budget are what you " +
        "approved (references/evolve-engine.md). One confirm per run; the run spec's budget bounds " +
        "the rest. Unsupported approval commands remain blocked for manual review.",
    };
  }
  return null;
}

const invokedDirectly = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("evolve-engine-guard.mjs");
if (invokedDirectly) runHook((j) => emitVerdict(evalEvolveEngine(j)));
