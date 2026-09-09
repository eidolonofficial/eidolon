import test from 'node:test';import assert from 'node:assert/strict';import {approvalOutput,permissionDecision} from './approval-contract.mjs';
test('deny outranks ask regardless of order',()=>{assert.equal(permissionDecision([{kind:'ask'},{kind:'block'}]),'deny');});
test('Claude emits the supported native ask',()=>assert.equal(JSON.parse(approvalOutput('claude','PreToolUse','ask').stdout).hookSpecificOutput.permissionDecision,'ask'));
test('Codex raw ask cannot fail open',()=>{const r=approvalOutput('codex','PreToolUse','ask');assert.equal(r.status,2);assert.equal(r.stdout,'');});
test('Codex already-pending permission request remains with the human',()=>{const r=approvalOutput('codex','PermissionRequest','ask');assert.equal(r.status,0);assert.equal(r.stdout,'');});
test('Codex hard denial uses its documented PermissionRequest shape',()=>assert.equal(JSON.parse(approvalOutput('codex','PermissionRequest','deny').stdout).hookSpecificOutput.decision.behavior,'deny'));
test('unknown host cannot assume native ask support',()=>assert.equal(approvalOutput('unknown','PreToolUse','ask').status,2));
