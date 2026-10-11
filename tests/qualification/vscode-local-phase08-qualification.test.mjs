import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CANDIDATE_IDENTITY,
  REPORTS_ROOT,
  REPO_ROOT
} from '../../scripts/qualification/candidate-identity-provider.mjs';
import { runLinuxProjectScenario } from '../../scripts/qualification/scenario-linux-project.mjs';
import {
  runLinuxHomeScenario,
  runMultiRootScenario
} from '../../scripts/qualification/scenario-linux-home-multiroot.mjs';
import {
  runUntrustedWorkspaceScenario,
  runWrongHarnessScenario,
  runDiagnosticProtocolProbes
} from '../../scripts/qualification/scenario-security-harness-probes.mjs';
import {
  writeUnexercisedAndUnsupportedReceipts,
  generateQualificationIndex
} from '../../scripts/qualification/qualification-ledger-publisher.mjs';

// -----------------------------------------------------------------------------
// 1. Pinned Runtime and Candidate Digest Verification
// -----------------------------------------------------------------------------
test('phase08-qualification: pinned candidate identity and digests match repository state', () => {
  assert.equal(CANDIDATE_IDENTITY.vscodeVersion, '1.140.0');
  assert.equal(CANDIDATE_IDENTITY.vscodeCommit, '07f806f999227108933c2e30515b26eecc1fda74');
  assert.equal(CANDIDATE_IDENTITY.copilotChatVersion, '0.68.0');
  assert.equal(CANDIDATE_IDENTITY.platform, 'linux');
  assert.equal(CANDIDATE_IDENTITY.arch, 'x64');

  assert.ok(CANDIDATE_IDENTITY.digests.targetsManifest !== 'MISSING');
  assert.ok(CANDIDATE_IDENTITY.digests.registryJson !== 'MISSING');
  assert.ok(CANDIDATE_IDENTITY.digests.pluginJson !== 'MISSING');
  assert.ok(CANDIDATE_IDENTITY.digests.hooksJson !== 'MISSING');
  assert.ok(CANDIDATE_IDENTITY.digests.bridgeScript !== 'MISSING');
  assert.ok(CANDIDATE_IDENTITY.digests.bootstrapRules !== 'MISSING');

  assert.ok(CANDIDATE_IDENTITY.pluginTree.count >= 750);
  assert.ok(typeof CANDIDATE_IDENTITY.pluginTree.hash === 'string' && CANDIDATE_IDENTITY.pluginTree.hash.length === 64);
});

// -----------------------------------------------------------------------------
// 2. Linux x64 Project Install Qualification
// -----------------------------------------------------------------------------
test('phase08-qualification: linux-x64-project executes full lifecycle and policy checks', () => {
  const result = runLinuxProjectScenario();
  assert.equal(result.ok, true);
  assert.equal(result.checks.sessionStartPass, true);
  assert.equal(result.checks.planSetPass, true);
  assert.equal(result.checks.readAllowPass, true);
  assert.equal(result.checks.scoutDenyPass, true);
  assert.equal(result.checks.privacyAskPass, true);
  assert.equal(result.checks.postToolReadPass, true);
  assert.equal(result.checks.postToolEditWarning, true);
  assert.equal(result.checks.preCompactPass, true);
  assert.equal(result.checks.subagentStartPass, true);
  assert.equal(result.checks.subagentStopPass, true);
  assert.equal(result.checks.stopPass, true);
  assert.equal(result.checks.secChildErrorHandled, true);

  const receiptPath = path.join(REPORTS_ROOT, 'linux-x64-project/receipt.md');
  const eventsPath = path.join(REPORTS_ROOT, 'linux-x64-project/events-redacted.jsonl');
  assert.ok(fs.existsSync(receiptPath), 'Receipt must exist');
  assert.ok(fs.existsSync(eventsPath), 'Redacted events must exist');

  const receipt = fs.readFileSync(receiptPath, 'utf8');
  assert.ok(receipt.includes('**QUALIFIED (PASSED)**'));
  assert.ok(receipt.includes('SessionStart'));
  assert.ok(receipt.includes('PreToolUse: Scout Policy'));
});

// -----------------------------------------------------------------------------
// 3. Linux x64 HOME Install Qualification
// -----------------------------------------------------------------------------
test('phase08-qualification: linux-x64-home exercises HOME scope and foreign CWD', () => {
  const result = runLinuxHomeScenario();
  assert.equal(result.ok, true);

  const receiptPath = path.join(REPORTS_ROOT, 'linux-x64-home/receipt.md');
  assert.ok(fs.existsSync(receiptPath));
  const receipt = fs.readFileSync(receiptPath, 'utf8');
  assert.ok(receipt.includes('**QUALIFIED (PASSED)**'));
});

// -----------------------------------------------------------------------------
// 4. Multi-Root Workspace Isolation
// -----------------------------------------------------------------------------
test('phase08-qualification: multi-root workspace isolates concurrent sessions and plans', () => {
  const result = runMultiRootScenario();
  assert.equal(result.ok, true);

  const receiptPath = path.join(REPORTS_ROOT, 'multi-root-workspace/receipt.md');
  assert.ok(fs.existsSync(receiptPath));
  const receipt = fs.readFileSync(receiptPath, 'utf8');
  assert.ok(receipt.includes('**QUALIFIED (PASSED)**'));
});

// -----------------------------------------------------------------------------
// 5. Untrusted Workspace Policy Boundary
// -----------------------------------------------------------------------------
test('phase08-qualification: untrusted workspace documents honest safety boundary', () => {
  const result = runUntrustedWorkspaceScenario();
  assert.equal(result.ok, true);

  const receiptPath = path.join(REPORTS_ROOT, 'untrusted-workspace/receipt.md');
  assert.ok(fs.existsSync(receiptPath));
  const receipt = fs.readFileSync(receiptPath, 'utf8');
  assert.ok(receipt.includes('UNEXERCISED (SIMULATION-ONLY BOUNDARY DOCUMENTED)'));
});

// -----------------------------------------------------------------------------
// 6. Prompt Reminder Isolation
// -----------------------------------------------------------------------------
test('phase08-qualification: prompt reminder preserves session-state isolation', () => {
  const result = runWrongHarnessScenario();
  assert.equal(result.ok, true);
  assert.equal(result.checks.reminderPass, true);
  assert.equal(result.checks.noStateMutationPass, true);

  const receiptPath = path.join(REPORTS_ROOT, 'wrong-harness-isolation/receipt.md');
  assert.ok(fs.existsSync(receiptPath));
  const receipt = fs.readFileSync(receiptPath, 'utf8');
  assert.ok(receipt.includes('Prompt Reminder Isolation'));

  const eventsPath = path.join(REPORTS_ROOT, 'wrong-harness-isolation/events-redacted.jsonl');
  assert.ok(fs.existsSync(eventsPath));
  const eventsContent = fs.readFileSync(eventsPath, 'utf8');
  assert.ok(eventsContent.includes('promptReminderIsolation'));
});

// -----------------------------------------------------------------------------
// 7. Diagnostic Protocol Probes
// -----------------------------------------------------------------------------
test('phase08-qualification: diagnostic protocol probes exercise host envelopes', () => {
  const result = runDiagnosticProtocolProbes();
  assert.equal(result.ok, true);
  assert.equal(result.checks.stopBlockPass, true);
  assert.equal(result.checks.stopLoopPass, true);
  assert.equal(result.checks.preDenyPass, true);

  const receiptPath = path.join(REPORTS_ROOT, 'diagnostic-protocol-probes/receipt.md');
  assert.ok(fs.existsSync(receiptPath));
  const receipt = fs.readFileSync(receiptPath, 'utf8');
  assert.ok(receipt.includes('Diagnostic Protocol Probes (Non-Production Fixture)'));
});

// -----------------------------------------------------------------------------
// 8. Context Ledger & Index Completeness
// -----------------------------------------------------------------------------
test('phase08-qualification: qualification index retains capability coverage without retired C37/C38 rows', () => {
  writeUnexercisedAndUnsupportedReceipts();
  generateQualificationIndex();

  const indexPath = path.join(REPORTS_ROOT, 'qualification-index.md');
  assert.ok(fs.existsSync(indexPath));
  const index = fs.readFileSync(indexPath, 'utf8');

  // Verify all 12 context receipts exist
  const contexts = [
    'linux-x64-project', 'linux-x64-home', 'multi-root-workspace',
    'untrusted-workspace', 'wrong-harness-isolation', 'diagnostic-protocol-probes',
    'windows-x64', 'macos-arm64', 'remote-ssh', 'wsl-linux', 'dev-container', 'other-remote-web'
  ];
  for (const ctx of contexts) {
    assert.ok(fs.existsSync(path.join(REPORTS_ROOT, ctx, 'receipt.md')), `Receipt for ${ctx} must exist`);
    assert.ok(index.includes(ctx), `Index must reference ${ctx}`);
  }

  const retiredIds = new Set(['C37', 'C38']);
  const expectedIds = Array.from({ length: 50 }, (_, i) => `C${String(i + 1).padStart(2, '0')}`)
    .filter(id => !retiredIds.has(id));
  const actualIds = [...index.matchAll(/^\|\s*\*\*(C\d{2})\*\*\s*\|/gm)]
    .map(match => match[1]);
  assert.deepEqual(actualIds, expectedIds, 'Index must contain every retained capability exactly once');
  for (const id of retiredIds) {
    assert.ok(!actualIds.includes(id), `Retired capability ${id} must not have a qualification row`);
  }
});
