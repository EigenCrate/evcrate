import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, '..');

describe('Snyk Expert - Workflow Qualification Scenarios & Boundaries', () => {
  const evalsPath = path.join(PACKAGE_ROOT, 'evals', 'evals.json');
  const fixSkillPath = path.join(PACKAGE_ROOT, '.agents', 'skills', 'snyk-fix', 'SKILL.md');
  const nodeRemediationPath = path.join(PACKAGE_ROOT, '.agents', 'skills', 'snyk-fix', 'references', 'node-typescript-remediation.md');
  const reviewSkillPath = path.join(PACKAGE_ROOT, '.agents', 'skills', 'dependency-upgrade-review', 'SKILL.md');
  const compatibilityPath = path.join(PACKAGE_ROOT, '.agents', 'skills', 'dependency-upgrade-review', 'references', 'compatibility-evidence.md');

  test('evals.json exists and contains well-formed qualification scenarios', () => {
    assert.ok(fs.existsSync(evalsPath), 'evals.json must exist');
    const content = JSON.parse(fs.readFileSync(evalsPath, 'utf8'));
    assert.equal(content.skill_name, 'snyk-expert');
    assert.ok(Array.isArray(content.evals), 'evals must be an array');
    assert.ok(content.evals.length >= 10, 'must have at least 10 evaluation scenarios');

    for (const item of content.evals) {
      assert.ok(typeof item.id === 'number', `eval ${item.id} must have numeric id`);
      assert.ok(typeof item.prompt === 'string' && item.prompt.length > 0, `eval ${item.id} must have prompt`);
      assert.ok(typeof item.expected_output === 'string' && item.expected_output.length > 0, `eval ${item.id} must have expected_output`);
      assert.ok(Array.isArray(item.assertions) && item.assertions.length > 0, `eval ${item.id} must have assertions`);
    }
  });

  test('qualification scenarios cover procedure enforcement and ad hoc update prohibition', () => {
    const content = JSON.parse(fs.readFileSync(evalsPath, 'utf8'));
    const eval1 = content.evals.find(e => e.id === 1);
    assert.ok(eval1, 'Eval 1 must exist');
    assert.ok(eval1.prompt.includes('Rimraf') && eval1.prompt.includes('Vitest'));
    assert.ok(eval1.expected_output.includes('Reject ad hoc owner updates'));
    assert.ok(eval1.expected_output.includes('procedure must exist'));
  });

  test('qualification scenarios cover pre-update test baseline requirement', () => {
    const content = JSON.parse(fs.readFileSync(evalsPath, 'utf8'));
    const eval2 = content.evals.find(e => e.id === 2);
    assert.ok(eval2, 'Eval 2 must exist');
    assert.ok(eval2.prompt.includes('20 passing, 2 failing, 2 skipped'));
    assert.ok(eval2.expected_output.includes('pre-update test baseline'));
  });

  test('qualification scenarios cover stale node_modules manifest rejection and lockfile baseline', () => {
    const content = JSON.parse(fs.readFileSync(evalsPath, 'utf8'));
    const eval3 = content.evals.find(e => e.id === 3);
    assert.ok(eval3, 'Eval 3 must exist');
    assert.ok(eval3.prompt.includes('stale'));
    assert.ok(eval3.expected_output.includes('Reject manifest-only scans'));
    assert.ok(eval3.expected_output.includes('package-lock.json'));
  });

  test('qualification scenarios cover development dependency parity (--dev)', () => {
    const content = JSON.parse(fs.readFileSync(evalsPath, 'utf8'));
    const eval4 = content.evals.find(e => e.id === 4);
    assert.ok(eval4, 'Eval 4 must exist');
    assert.ok(eval4.prompt.includes('--dev'));
    assert.ok(eval4.expected_output.includes('Strict parity rule'));
    assert.ok(eval4.expected_output.includes('--dev'));
  });

  test('qualification scenarios cover coupled test runner and coverage provider pairing', () => {
    const content = JSON.parse(fs.readFileSync(evalsPath, 'utf8'));
    const eval5 = content.evals.find(e => e.id === 5);
    assert.ok(eval5, 'Eval 5 must exist');
    assert.ok(eval5.prompt.includes('vitest') && eval5.prompt.includes('@vitest/coverage-v8'));
    assert.ok(eval5.expected_output.includes('Coupled tooling suites'));
  });

  test('qualification scenarios cover npm script inspection and external side-effects', () => {
    const content = JSON.parse(fs.readFileSync(evalsPath, 'utf8'));
    const eval6 = content.evals.find(e => e.id === 6);
    assert.ok(eval6, 'Eval 6 must exist');
    assert.ok(eval6.prompt.includes('postbuild'));
    assert.ok(eval6.expected_output.includes('Inspect package scripts'));
    assert.ok(eval6.expected_output.includes('general build is not safe'));
  });

  test('qualification scenarios distinguish path disappearance from advisory remediation', () => {
    const content = JSON.parse(fs.readFileSync(evalsPath, 'utf8'));
    const eval7 = content.evals.find(e => e.id === 7);
    assert.ok(eval7, 'Eval 7 must exist');
    assert.ok(eval7.prompt.includes('5 vulnerable paths') && eval7.prompt.includes('27 vulnerable paths'));
    assert.ok(eval7.expected_output.includes("Distinguish 'path gone' from 'advisory fixed'"));
  });

  test('qualification scenarios enforce approval invalidation upon baseline drift', () => {
    const content = JSON.parse(fs.readFileSync(evalsPath, 'utf8'));
    const eval8 = content.evals.find(e => e.id === 8);
    assert.ok(eval8, 'Eval 8 must exist');
    assert.ok(eval8.prompt.includes('earlier Rimraf update was applied'));
    assert.ok(eval8.expected_output.includes('Baseline drift voids prior human approval'));
  });

  test('remediation skills explicitly encode all workflow qualification boundaries', () => {
    const fixSkill = fs.readFileSync(fixSkillPath, 'utf8');
    assert.ok(fixSkill.includes('procedure exists and is validated **before ANY owner update**'));
    assert.ok(fixSkill.includes('references/node-typescript-remediation.md'));
    assert.ok(fixSkill.includes('Approval is strictly bound to the exact owner set and current baseline'));

    const nodeRemediation = fs.readFileSync(nodeRemediationPath, 'utf8');
    assert.ok(nodeRemediation.includes('Full ordered dependency path accounting'));
    assert.ok(nodeRemediation.includes('Comparable lockfile baseline'));
    assert.ok(nodeRemediation.includes('Coupled testing and coverage suites'));
    assert.ok(nodeRemediation.includes('Pre-update test baseline execution'));
    assert.ok(nodeRemediation.includes('Script inspection before execution'));

    const reviewSkill = fs.readFileSync(reviewSkillPath, 'utf8');
    assert.ok(reviewSkill.includes('references/compatibility-evidence.md'));

    const compatibility = fs.readFileSync(compatibilityPath, 'utf8');
    assert.ok(compatibility.includes('Coupled tool suites and testing frameworks'));
    assert.ok(compatibility.includes('Package scripts and lifecycle hook side effects'));
  });
});
