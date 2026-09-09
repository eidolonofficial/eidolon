import {evalManagedState} from './policy-manifest.mjs';
import {evalRuntimeIntegrity} from './runtime-integrity-guard.mjs';
// Shared policy inventory. Both host transports use the original evaluator order.
import { evalVerification } from './verification-guard.mjs';
import { evalCommitQuality } from './commit-quality-guard.mjs';
import { evalPersonaConduct } from './persona-conduct-guard.mjs';
import { evalHookIntegrity } from './hook-integrity-guard.mjs';
import { evalDeletion } from './deletion-guard.mjs';
import { evalProtectedPaths } from './protected-paths-guard.mjs';
import { evalVisualEvidence } from './visual-evidence-gate.mjs';
import { evalConduct } from './conduct-guard.mjs';
import { evalEvolveEngine } from './evolve-engine-guard.mjs';
import { evalAppendOnlyRecord } from './append-only-record-guard.mjs';
import { evalDrift } from './drift-guard.mjs';
import { evalSettingsIntegrity } from './settings-integrity-guard.mjs';

export const bashEvaluators = [
  evalManagedState, evalRuntimeIntegrity,
  evalVerification, evalCommitQuality, evalPersonaConduct, evalHookIntegrity,
  evalDeletion, evalProtectedPaths, evalVisualEvidence, evalConduct, evalEvolveEngine,
];
export const writeEvaluators = [
  evalManagedState, evalRuntimeIntegrity,
  evalAppendOnlyRecord, evalPersonaConduct, evalDrift, evalConduct, evalSettingsIntegrity,
];
