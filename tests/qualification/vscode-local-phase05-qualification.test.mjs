import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  runPhase05Qualification,
  PHASE05_REPORTS_DIR
} from '../../scripts/qualification/scenario-phase05-native-delegation.mjs';

import {
  CANDIDATE_IDENTITY,
  REPO_ROOT
} from '../../scripts/qualification/candidate-identity-provider.mjs';

// -----------------------------------------------------------------------------
// 1. Pinned Runtime and Candidate Digest Verification
// -----------------------------------------------------------------------------
test('phase05-qualification: pinned candidate identity and digests match repository state', () => {
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
// 2. Full Phase 05 Native Qualification Execution & Scenario Checks
// -----------------------------------------------------------------------------
test('phase05-qualification: executes all 11 qualification cases (N01-N10, W04) successfully', async () => {
  const result = await runPhase05Qualification();
  assert.ok(result, 'Qualification result must exist');

  const cases = result.cases;
  const totalCases = Object.keys(cases).length;
  assert.equal(totalCases, 11, 'Must execute exactly 11 qualification cases');

  // Verify N01: Direct reader
  assert.equal(cases.N01.status, 'PASS');
  assert.deepEqual(cases.N01.toolsExercised, ['search/fileSearch', 'search/textSearch', 'read/readFile']);
  assert.equal(cases.N01.fileMutated, false);

  // Verify N02: Delegated reader
  assert.equal(cases.N02.status, 'PASS');
  assert.equal(cases.N02.childAgent, 'contract-reader');
  assert.equal(cases.N02.promptContainedAnswer, false);

  // Verify N03: Production Scout direct & delegated
  assert.equal(cases.N03.status, 'PASS');
  assert.equal(cases.N03.nativeReferencesPresent, true);
  assert.equal(cases.N03.directReadPass, true);
  assert.equal(cases.N03.delegatedReadPass, true);
  assert.equal(cases.N03.workspaceModified, false);

  // Verify N04: Deny-all control
  assert.equal(cases.N04.status, 'PASS');
  assert.equal(cases.N04.toolsDeclaredEmpty, true);
  assert.equal(cases.N04.agentsDeclaredEmpty, true);
  assert.equal(cases.N04.toolInvocationDenied, true);

  // Verify N05: No-child control
  assert.equal(cases.N05.status, 'PASS');
  assert.equal(cases.N05.delegationBlocked, true);

  // Verify N06: Permitted coordinator delegation
  assert.equal(cases.N06.status, 'PASS');
  assert.equal(cases.N06.delegationSucceeded, true);

  // Verify N07: Edit capability family
  assert.equal(cases.N07.status, 'PASS');
  assert.equal(cases.N07.createFilePass, true);
  assert.equal(cases.N07.replaceStringPass, true);
  assert.equal(cases.N07.multiReplaceStringPass, true);
  assert.equal(cases.N07.terminalBypassUsed, false);

  // Verify N08: Terminal capability family
  assert.equal(cases.N08.status, 'PASS');
  assert.equal(cases.N08.benignExecutionAllowed, true);
  assert.equal(cases.N08.outputQueryAllowed, true);
  assert.equal(cases.N08.terminationAllowed, true);
  assert.equal(cases.N08.privilegeWidened, false);

  // Verify N09: Todo context restriction
  assert.equal(cases.N09.status, 'PASS');
  assert.equal(cases.N09.directTodoResolved, true);
  assert.equal(cases.N09.delegatedChildRestrictionRecorded, true);

  // Verify N10: Policy controls
  assert.equal(cases.N10.status, 'PASS');
  assert.equal(cases.N10.scoutHeavyDirDenied, true);
  assert.equal(cases.N10.privacyFileAsked, true);
  assert.equal(cases.N10.filePathNormalized, true);
  assert.equal(cases.N10.pathNormalized, true);

  // Verify W04: Candidate registration
  assert.equal(cases.W04.status, 'PASS');
  assert.equal(cases.W04.collisionDetected, false);

  // Verify Windows platform status
  assert.ok(result.windows);
  assert.equal(result.windows.status, 'BLOCKED');
  assert.ok(result.windows.reason.includes('Host unavailable in Linux workstation'));

  // Verify emitted reports and sanitized logs
  const reportPath = path.join(PHASE05_REPORTS_DIR, 'native-qualification.md');
  const eventsPath = path.join(PHASE05_REPORTS_DIR, 'native-qualification-events.jsonl');

  assert.ok(fs.existsSync(reportPath), 'Markdown report must exist');
  assert.ok(fs.existsSync(eventsPath), 'Sanitized event log must exist');

  const reportContent = fs.readFileSync(reportPath, 'utf8');
  assert.ok(reportContent.includes('QUALIFIED (PASSED)'));
  assert.ok(reportContent.includes('11/11 cases passed'));
  assert.ok(reportContent.includes('BLOCKED'));
});
