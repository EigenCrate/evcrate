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
  const expertPath = path.join(PACKAGE_ROOT, '.agents', 'agents', 'snyk-expert.md');
  const cliSkillPath = path.join(PACKAGE_ROOT, '.agents', 'skills', 'snyk-cli', 'SKILL.md');
  const cliWorkflowPath = path.join(PACKAGE_ROOT, '.agents', 'skills', 'snyk-cli', 'references', 'cli-workflow.md');
  const mavenRemediationPath = path.join(PACKAGE_ROOT, '.agents', 'skills', 'snyk-fix', 'references', 'maven-spring-remediation.md');
  const reviewOutputPath = path.join(PACKAGE_ROOT, '.agents', 'skills', 'dependency-upgrade-review', 'references', 'review-output.md');
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

  test('specialist and fix skills enforce one-set execution, neutral procedure gate, and live scan handoff to main', () => {
    const expert = fs.readFileSync(expertPath, 'utf8');
    assert.ok(expert.includes('local verification complete; Snyk verification pending'));
    assert.ok(expert.includes('Execute exactly ONE coherent owner set per mutating specialist invocation'));
    assert.ok(expert.includes('pre-edit procedure evaluation table'));
    assert.ok(expert.includes('Analysis performs zero target writes'));
    assert.ok(expert.includes('Main alone owns authentic same-scope live Snyk rescans'));
    assert.ok(!expert.includes('other ecosystems remain blocked'));

    const fixSkill = fs.readFileSync(fixSkillPath, 'utf8');
    assert.ok(fixSkill.includes('local verification complete; Snyk verification pending'));
    assert.ok(fixSkill.includes('Execute exactly ONE coherent owner set per invocation'));
    assert.ok(fixSkill.includes('zero target edits, including eligible proposals'));
    assert.ok(fixSkill.includes('Do not write evidence into the target or run commands that mutate it (including creating or writing to private evidence directories inside the target)'));
    assert.ok(fixSkill.includes('Specialist never declares terminal `fixed` or overall `completed` on local evidence alone'));
  });

  test('cli skill and workflow enforce safe storage binding, unsafe-storage pause, and safe troubleshooting', () => {
    const cliSkill = fs.readFileSync(cliSkillPath, 'utf8');
    assert.ok(cliSkill.includes('main\'s exact private ignored target-contained destination'));
    assert.ok(cliSkill.includes('Unsafe storage pauses artifact-producing execution'));
    assert.ok(cliSkill.includes('NODE_TLS_REJECT_UNAUTHORIZED=0'));
    assert.ok(cliSkill.includes('distinguishing proxy from CA trust without TLS bypass'));

    const cliWorkflow = fs.readFileSync(cliWorkflowPath, 'utf8');
    assert.ok(cliWorkflow.includes('Safe CLI troubleshooting'));
    assert.ok(cliWorkflow.includes('HTTP_PROXY'));
    assert.ok(cliWorkflow.includes('NODE_EXTRA_CA_CERTS'));
    assert.ok(cliWorkflow.includes('Other supported ecosystems and package managers'));
    assert.ok(cliWorkflow.includes('main\'s exact private ignored target-contained destination binding'));
    assert.ok(cliWorkflow.includes('Unsafe storage pauses artifact-producing execution immediately'));
  });

  test('node and maven remediation references enforce one-set execution and handoff to main for live scan', () => {
    const nodeRemediation = fs.readFileSync(nodeRemediationPath, 'utf8');
    assert.ok(nodeRemediation.includes('Execute exactly ONE coherent owner set per mutating specialist invocation'));
    assert.ok(nodeRemediation.includes('local verification complete; Snyk verification pending'));
    assert.ok(nodeRemediation.includes('Main alone owns authentic baseline and post-remediation live Snyk scanning'));

    const mavenRemediation = fs.readFileSync(mavenRemediationPath, 'utf8');
    assert.ok(mavenRemediation.includes('Apply exactly ONE coherent owner set per mutating specialist invocation'));
    assert.ok(mavenRemediation.includes('local verification complete; Snyk verification pending'));
    assert.ok(mavenRemediation.includes('Main alone owns authentic baseline and post-remediation live Snyk scanning'));
  });

  test('dependency-upgrade-review references enforce zero target writes and generic compatibility dimensions', () => {
    const reviewSkill = fs.readFileSync(reviewSkillPath, 'utf8');
    assert.ok(reviewSkill.includes('Zero target writes'));
    assert.ok(reviewSkill.includes('pre-edit procedure table'));

    const compatibility = fs.readFileSync(compatibilityPath, 'utf8');
    assert.ok(compatibility.includes('The review is strictly read-only: zero target writes'));
    assert.ok(compatibility.includes('Generic cross-ecosystem compatibility dimensions'));

    const reviewOutput = fs.readFileSync(reviewOutputPath, 'utf8');
    assert.ok(reviewOutput.includes('zero target writes across all modes'));
    assert.ok(reviewOutput.includes('Live Snyk rescan verification belongs to main session'));
  });
});
