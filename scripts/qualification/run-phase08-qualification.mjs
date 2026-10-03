#!/usr/bin/env node
/**
 * run-phase08-qualification.mjs
 *
 * Real VS Code Local qualification runner orchestrator for Phase 08.
 * Executes live native scenarios across all defined context ledgers:
 *   - linux-x64-project
 *   - linux-x64-home
 *   - multi-root-workspace
 *   - untrusted-workspace
 *   - wrong-harness-isolation
 *   - diagnostic-protocol-probes
 *   - unexercised / unsupported contexts
 * Emits durable evidence receipts under reports/native-local/ and
 * generates qualification-index.md reconciling capability matrix C01-C50.
 */

import { fileURLToPath } from 'node:url';
import { CANDIDATE_IDENTITY } from './candidate-identity-provider.mjs';
import { runLinuxProjectScenario } from './scenario-linux-project.mjs';
import { runLinuxHomeScenario, runMultiRootScenario } from './scenario-linux-home-multiroot.mjs';
import {
  runUntrustedWorkspaceScenario,
  runWrongHarnessScenario,
  runDiagnosticProtocolProbes
} from './scenario-security-harness-probes.mjs';
import {
  writeUnexercisedAndUnsupportedReceipts,
  generateQualificationIndex
} from './qualification-ledger-publisher.mjs';

export async function runAllQualifications() {
  console.log('Starting Phase 08 VS Code Local Native Qualification...');
  console.log(`Workstation: Linux ${CANDIDATE_IDENTITY.kernel} (${CANDIDATE_IDENTITY.arch})`);
  console.log(`VS Code: ${CANDIDATE_IDENTITY.vscodeVersion} (${CANDIDATE_IDENTITY.vscodeCommit})`);
  console.log(`Copilot Chat: ${CANDIDATE_IDENTITY.copilotChatVersion}`);
  console.log(`Plugin tree hash: ${CANDIDATE_IDENTITY.pluginTree.hash} (${CANDIDATE_IDENTITY.pluginTree.count} files)`);

  runLinuxProjectScenario();
  console.log('✓ Linux x64 project install scenarios completed');

  runLinuxHomeScenario();
  console.log('✓ Linux x64 HOME install scenarios completed');

  runMultiRootScenario();
  console.log('✓ Multi-root workspace isolation scenarios completed');

  runUntrustedWorkspaceScenario();
  console.log('✓ Untrusted workspace boundary recorded');

  runWrongHarnessScenario();
  console.log('✓ Wrong-harness isolation scenarios completed');

  runDiagnosticProtocolProbes();
  console.log('✓ Diagnostic protocol probes completed');

  writeUnexercisedAndUnsupportedReceipts();
  console.log('✓ Unexercised and unsupported context receipts recorded');

  generateQualificationIndex();
  console.log('✓ Qualification index generated at reports/native-local/qualification-index.md');

  return { ok: true };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runAllQualifications()
    .then(() => {
      console.log('Phase 08 qualification completed successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Phase 08 qualification failed:', err);
      process.exit(1);
    });
}
