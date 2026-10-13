import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, '..');

describe('Snyk Expert - Evaluation Catalog & Acceptance Specifications', () => {
  const evalsPath = path.join(PACKAGE_ROOT, 'evals', 'evals.json');

  test('evals.json exists and adheres to structured evaluation schema', () => {
    assert.ok(fs.existsSync(evalsPath), 'evals.json must exist');
    const content = JSON.parse(fs.readFileSync(evalsPath, 'utf8'));
    assert.equal(content.skill_name, 'snyk-expert');
    assert.ok(Array.isArray(content.evals), 'evals must be an array');
    assert.ok(content.evals.length > 0, 'evals array must not be empty');

    const seenIds = new Set();
    const validEvidenceClasses = new Set(['Delivery', 'Specification', 'Operational']);

    for (const item of content.evals) {
      assert.ok(typeof item.id === 'number' && item.id > 0, `eval id must be positive number: ${item.id}`);
      assert.ok(!seenIds.has(item.id), `duplicate scenario id detected: ${item.id}`);
      seenIds.add(item.id);

      assert.ok(typeof item.acceptance_id === 'string' && /^SNYK-\d{3}$/.test(item.acceptance_id),
        `scenario ${item.id} has invalid acceptance_id: ${item.acceptance_id}`);
      assert.ok(validEvidenceClasses.has(item.evidence_class),
        `scenario ${item.id} has invalid evidence_class: ${item.evidence_class}`);
      assert.ok(typeof item.prerequisites === 'string' && item.prerequisites.length > 0,
        `scenario ${item.id} must declare prerequisites`);
      assert.ok(typeof item.prompt === 'string' && item.prompt.length > 0,
        `scenario ${item.id} must have prompt`);
      assert.ok(typeof item.expected_output === 'string' && item.expected_output.length > 0,
        `scenario ${item.id} must have expected_output`);
      assert.ok(Array.isArray(item.assertions) && item.assertions.length > 0,
        `scenario ${item.id} must have assertions array`);
      for (const assertion of item.assertions) {
        assert.ok(typeof assertion === 'string' && assertion.length > 0,
          `scenario ${item.id} assertion must be non-empty string`);
      }
    }
  });

  test('evaluation catalog covers acceptance matrix IDs SNYK-001 through SNYK-036', () => {
    const content = JSON.parse(fs.readFileSync(evalsPath, 'utf8'));
    const mappedIds = new Set(content.evals.map(e => e.acceptance_id));

    // Sequence SNYK-001 through SNYK-036 must all be represented
    for (let i = 1; i <= 36; i++) {
      const idStr = `SNYK-${String(i).padStart(3, '0')}`;
      assert.ok(mappedIds.has(idStr), `acceptance scenario ${idStr} must be covered in evals catalog`);
    }

    // SNYK-035 must include distinct scenario variants for storage boundaries
    const snyk035Cases = content.evals.filter(e => e.acceptance_id === 'SNYK-035');
    assert.ok(snyk035Cases.length > 1, 'SNYK-035 must specify distinct storage boundary variants');
    const snyk035Prompts = new Set(snyk035Cases.map(e => e.prompt));
    assert.equal(snyk035Prompts.size, snyk035Cases.length,
      'SNYK-035 variants must define distinct scenario stimuli');

    // SNYK-036 must include distinct scenario variants for procedure learning boundaries
    const snyk036Cases = content.evals.filter(e => e.acceptance_id === 'SNYK-036');
    assert.ok(snyk036Cases.length > 1, 'SNYK-036 must specify distinct procedure learning variants');
    const snyk036Prompts = new Set(snyk036Cases.map(e => e.prompt));
    assert.equal(snyk036Prompts.size, snyk036Cases.length,
      'SNYK-036 variants must define distinct scenario stimuli');
  });

  // Specification-only check: Validating evals.json schema confirms structural catalog completeness.
  // Per acceptance-matrix.md and design-contracts.md, specification checks do NOT substitute for live
  // operational host/model tool traces or authenticated Snyk scanner qualification.
  test('evaluation catalog distinguishes evidence classes per acceptance-matrix boundaries', () => {
    const content = JSON.parse(fs.readFileSync(evalsPath, 'utf8'));

    // Operational scenarios require live executing-host tool/scan evidence per acceptance-matrix
    const operationalCases = content.evals.filter(e => e.evidence_class === 'Operational');
    assert.ok(operationalCases.length > 0, 'Catalog must specify operational scenarios');

    // Delivery scenarios verify packaging, file presence, and installer behavior
    const deliveryCases = content.evals.filter(e => e.evidence_class === 'Delivery');
    assert.ok(deliveryCases.length > 0, 'Catalog must specify delivery scenarios');

    // Specification scenarios represent policy/prohibition contracts
    const specCases = content.evals.filter(e => e.evidence_class === 'Specification');
    assert.ok(specCases.length > 0, 'Catalog must specify policy specification scenarios');

    // Ensure all scenario prompts contain an explicit stimulus section
    for (const item of content.evals) {
      assert.ok(item.prompt.includes('Stimulus:'),
        `scenario ${item.id} prompt must contain an explicit Stimulus section`);
    }
  });

  test('SNYK-035 storage boundary scenarios specify observable stop traces and access controls', () => {
    const content = JSON.parse(fs.readFileSync(evalsPath, 'utf8'));
    const snyk035Cases = content.evals.filter(e => e.acceptance_id === 'SNYK-035');
    assert.ok(snyk035Cases.length >= 3, 'SNYK-035 must have at least 3 scenario specifications');

    // Scenarios specifying storage rejection must specify contract trace fields: current_stage, stop_reason, next_action
    const rejectionCases = snyk035Cases.filter(e => e.expected_output.toLowerCase().includes('pauses'));
    assert.ok(rejectionCases.length >= 2, 'SNYK-035 must specify at least 2 storage pause/rejection scenarios');
    for (const item of rejectionCases) {
      assert.ok(item.expected_output.includes('stop_reason'),
        `scenario ${item.id} must specify stop_reason in expected_output`);
      assert.ok(item.expected_output.includes('current_stage'),
        `scenario ${item.id} must specify current_stage in expected_output`);
      assert.ok(item.expected_output.includes('next_action'),
        `scenario ${item.id} must specify next_action in expected_output`);
    }

    // Verify access-control and single-writer assertions
    const allAssertions = snyk035Cases.flatMap(e => e.assertions);
    assert.ok(allAssertions.some(a => a.toLowerCase().includes('single writer') || a.toLowerCase().includes('single-writer')),
      'SNYK-035 assertions must enforce exclusive single-writer ownership');
    assert.ok(allAssertions.some(a => a.toLowerCase().includes('ancestor') || a.toLowerCase().includes('containment')),
      'SNYK-035 assertions must enforce access-controlled ancestor/leaf containment');
  });

  test('failed remediation attempts specify mandatory ledger finalization and recovery boundaries', () => {
    const content = JSON.parse(fs.readFileSync(evalsPath, 'utf8'));
    const failureCases = content.evals.filter(e =>
      e.expected_output.toLowerCase().includes('failed-attempt finalization')
    );
    assert.ok(failureCases.length >= 1, 'must include at least 1 failed-attempt ledger finalization scenario');
    for (const item of failureCases) {
      assert.ok(item.expected_output.includes('failed/unavailable'),
        `scenario ${item.id} must specify failed/unavailable post-scan observation`);
      assert.ok(item.expected_output.includes('unverified'),
        `scenario ${item.id} must specify unverified disposition`);
      assert.ok(item.expected_output.includes('native-check-failed'),
        `scenario ${item.id} must specify native-check-failed stop_reason`);
      assert.ok(item.assertions.some(a => a.toLowerCase().includes('every original')),
        `scenario ${item.id} must assert ledger rows for every original record`);
      assert.ok(item.assertions.some(a => a.toLowerCase().includes('prohibit') || a.toLowerCase().includes('another owner')),
        `scenario ${item.id} must assert prohibition on advancing to another owner set`);
    }
  });
});
