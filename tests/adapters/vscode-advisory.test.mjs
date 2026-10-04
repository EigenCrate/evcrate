import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  renderVscodeAdvisoryCapabilities,
  renderVscodeInlineAdviseCommand,
  renderVscodeAdvisoryInterviewWorkflow,
  renderVscodeMentoringWorkflow,
  resolveVscodeAdvisorExecutable,
  validateAdvisorEvidence,
  validateAdvisorConsole,
  buildAdvisorCheckpointEnvelope,
  buildAdvisorStateEnvelope,
  ADVISE_AGENT_RELAY_UNSUPPORTED_VSCODE,
  ADVICE_CALLER_UNAVAILABLE_VSCODE
} from '../../dist/adapters/vscode/index.js';
import { MENTORING_START, MENTORING_END, CANONICAL_MENTORING } from '../../dist/adapters/advisory.js';

test('advisory: capability rendering and explicit unsupported relay', () => {
  const sample = `<!-- EVCRATE_ADVISORY_CAPABILITIES_START -->
<!-- EVCRATE_CAPABILITY: advise-inline/v1 -->
<!-- EVCRATE_CAPABILITY: advise-agent-relay/claude/v1 -->
<!-- EVCRATE_ADVISORY_CAPABILITIES_END -->
Body text`;

  const rendered = renderVscodeAdvisoryCapabilities(sample);
  assert.ok(rendered.includes('advise-agent-relay/unsupported/vscode/v1'));
  assert.ok(rendered.includes(ADVISE_AGENT_RELAY_UNSUPPORTED_VSCODE));

  const cmdSample = `---\ndescription: "Advice"\n---\n${sample}`;
  const cmd = renderVscodeInlineAdviseCommand(cmdSample, 'vscode/askQuestions');
  assert.ok(cmd.includes(ADVISE_AGENT_RELAY_UNSUPPORTED_VSCODE));
  assert.ok(cmd.includes('vscode/askQuestions'));
  assert.ok(cmd.includes('## Reframed problem'));
  assert.ok(cmd.includes('## Recommendation'));
});

test('advisory: mentoring workflow transformation and capability bounds', () => {
  const mentoringDoc = `${MENTORING_START}\n${CANONICAL_MENTORING}\n${MENTORING_END}\n# Workflow Body`;
  const rendered = renderVscodeMentoringWorkflow(mentoringDoc);

  assert.ok(rendered.includes('<!-- EVCRATE_CAPABILITY: mentoring/supported/v2 -->'));
  assert.ok(rendered.includes('<!-- EVCRATE_CAPABILITY: write-checks/vscode/advisory-only/v1 -->'));
  assert.ok(rendered.includes('# Workflow Body'));

  const unavail = renderVscodeMentoringWorkflow(mentoringDoc, { mentoring: 'unavailable', writeChecks: 'unavailable' });
  assert.ok(unavail.includes('<!-- EVCRATE_CAPABILITY: mentoring/unavailable/v2 -->'));
  assert.ok(unavail.includes('<!-- EVCRATE_CAPABILITY: write-checks/vscode/unavailable/v1 -->'));

  assert.throws(() => renderVscodeMentoringWorkflow('malformed text'));
});

test('advisory: resolveVscodeAdvisorExecutable checks home directory executable', () => {
  const tempHome = mkdtempSync(join(tmpdir(), 'evcrate-test-home-'));
  try {
    const unavail = resolveVscodeAdvisorExecutable(tempHome);
    assert.equal(unavail.available, false);
    assert.equal(unavail.reason, ADVICE_CALLER_UNAVAILABLE_VSCODE);

    const binDir = join(tempHome, '.evcrate', 'bin');
    mkdirSync(binDir, { recursive: true });
    const execPath = join(binDir, 'evcrate-advisor');
    writeFileSync(execPath, '#!/bin/sh\necho ok\n', { mode: 0o755 });

    const avail = resolveVscodeAdvisorExecutable(tempHome);
    assert.equal(avail.available, true);
    assert.equal(avail.executablePath, execPath);
  } finally {
    rmSync(tempHome, { recursive: true, force: true });
  }
});

test('advisory: validateAdvisorEvidence enforces bounds and rejects secrets', () => {
  const validFile = {
    path: 'src/file.ts',
    excerpt: 'function hello() {}',
    digest: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  };

  const validEvidence = {
    summary: 'Validation summary',
    files: [validFile]
  };

  const res = validateAdvisorEvidence(validEvidence);
  assert.equal(res.valid, true);

  // Rejects > 4 files
  const tooManyFiles = {
    summary: 'Summary',
    files: [validFile, validFile, validFile, validFile, validFile]
  };
  const resTooMany = validateAdvisorEvidence(tooManyFiles);
  assert.equal(resTooMany.valid, false);
  assert.ok(resTooMany.errors.some((e) => e.includes('exceeds maximum 4')));

  // Rejects unsafe paths
  const unsafePath = {
    summary: 'Summary',
    files: [{ ...validFile, path: '../outside.ts' }]
  };
  const resUnsafe = validateAdvisorEvidence(unsafePath);
  assert.equal(resUnsafe.valid, false);
  assert.ok(resUnsafe.errors.some((e) => e.includes('safe repository-relative')));

  // Rejects credentials
  const credentialEvidence = {
    summary: 'Bearer token ghp_123456789012345678901234567890',
    files: []
  };
  const resCred = validateAdvisorEvidence(credentialEvidence);
  assert.equal(resCred.valid, false);
  assert.ok(resCred.errors.some((e) => e.includes('credentials')));
});

test('advisory: validateAdvisorConsole and envelope builders produce valid shapes', () => {
  const consoleRes = validateAdvisorConsole();
  assert.equal(typeof consoleRes.isInteractive, 'boolean');
  assert.ok(['tty', 'console', 'none'].includes(consoleRes.channel));

  const checkpoint = buildAdvisorCheckpointEnvelope({
    task_run_id: '11111111-1111-4000-8000-111111111111',
    checkpoint_id: 'checkpoint-test',
    phase_id: 'phase-05',
    task_revision: 1,
    evidence_revision: 0,
    checkpoint: 'review:step-4',
    kind: 'review',
    question: 'Proceed?',
    task: { goal: 'Goal', authorized_paths: ['src/file.ts'] },
    proposal: { next_action: 'Proceed', rationale: 'Score 9/10', intended_changed_paths: [] },
    evidence: { summary: 'Tests passed', files: [] }
  });

  assert.equal(checkpoint.protocol, 'evcrate-advisor-checkpoint');
  assert.equal(checkpoint.version, 2);
  assert.equal(checkpoint.kind, 'review');

  const stateEnvelope = buildAdvisorStateEnvelope('init', {
    task_run_id: '11111111-1111-4000-8000-111111111111',
    expected_revision: 0,
    payload: { phase_id: 'phase-05' }
  });
  assert.equal(stateEnvelope.protocol, 'evcrate-advisor-state');
  assert.equal(stateEnvelope.version, 1);
  assert.equal(stateEnvelope.operation, 'init');
});
