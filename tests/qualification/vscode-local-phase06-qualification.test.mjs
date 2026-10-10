import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  runPhase06DocsWorkflow,
  PHASE06_REPORTS_DIR
} from '../../scripts/qualification/scenario-phase06-docs-workflow.mjs';

import {
  CANDIDATE_IDENTITY,
  REPO_ROOT
} from '../../scripts/qualification/candidate-identity-provider.mjs';

// -----------------------------------------------------------------------------
// 1. Pinned Runtime and Candidate Digest Verification
// -----------------------------------------------------------------------------
test('phase06-qualification: pinned candidate identity and digests match repository state', () => {
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
// 2. Full Phase 06 Documentation Workflow Execution & Scenario Checks
// -----------------------------------------------------------------------------
test('phase06-qualification: executes all 3 qualification cases (W01, W02, W03) successfully', async () => {
  const result = await runPhase06DocsWorkflow();
  assert.ok(result, 'Qualification result must exist');

  const cases = result.cases;
  const totalCases = Object.keys(cases).length;
  assert.equal(totalCases, 3, 'Must execute exactly 3 workflow qualification cases');

  // Verify W01: Disjoint Scout tasks
  assert.equal(cases.W01.status, 'PASS');
  assert.equal(cases.W01.scout1Slice, 'src/module-a.js');
  assert.equal(cases.W01.scout2Slice, 'src/module-b.js');
  assert.ok(cases.W01.sliceAToken.startsWith('AlphaMetricToken:'));
  assert.ok(cases.W01.sliceBToken.startsWith('BetaBatchToken:'));
  assert.equal(cases.W01.sourceImmutabilityVerified, true);
  assert.equal(cases.W01.parentMergedReportCount, 2);
  assert.equal(cases.W01.fabricationDetected, false);

  // Verify W02: Canonical docs-manager with omitted tools
  assert.equal(cases.W02.status, 'PASS');
  assert.equal(cases.W02.toolsOmittedInManifest, true);
  assert.equal(cases.W02.inheritedEditingVerified, true);
  assert.equal(cases.W02.sliceAFactsIncorporated, true);
  assert.equal(cases.W02.sliceBFactsIncorporated, true);
  assert.equal(cases.W02.sourceImmutabilityMaintained, true);
  assert.equal(cases.W02.unauthorizedChangesCount, 0);

  // Verify W03: Actual cmd-docs-update workflow
  assert.equal(cases.W03.status, 'PASS');
  assert.equal(cases.W03.skillExists, true);
  assert.equal(cases.W03.phase1Scouting.scoutsSpawned, 2);
  assert.equal(cases.W03.phase15ReaderBranch.docCount, 4);
  assert.equal(cases.W03.phase15ReaderBranch.exploreRegisteredInHost, false);
  assert.equal(cases.W03.phase15ReaderBranch.resolvedHostReaderAgent, 'evc-scout');
  assert.equal(cases.W03.phase3SizeChecks.passed, true);
  assert.equal(cases.W03.phase4Validation.status, 'PASS');

  // Verify Windows platform status
  assert.ok(result.windows);
  assert.equal(result.windows.status, 'BLOCKED');
  assert.ok(result.windows.reason.includes('Host unavailable in Linux workstation'));

  // Verify emitted reports and sanitized event logs
  const reportPath = path.join(PHASE06_REPORTS_DIR, 'docs-workflow-qualification.md');
  const eventsPath = path.join(PHASE06_REPORTS_DIR, 'docs-workflow-events.jsonl');

  assert.ok(fs.existsSync(reportPath), 'Markdown report must exist');
  assert.ok(fs.existsSync(eventsPath), 'Sanitized event log must exist');

  const reportContent = fs.readFileSync(reportPath, 'utf8');
  assert.ok(reportContent.includes('QUALIFIED (PASSED)'));
  assert.ok(reportContent.includes('3/3 cases passed'));
  assert.ok(reportContent.includes('BLOCKED'));
});
