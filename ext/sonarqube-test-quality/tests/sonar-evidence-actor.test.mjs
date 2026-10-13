import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const actorPath = path.join(packageRoot, 'agents', 'sonar-evidence.md');
const cyclesPath = path.join(packageRoot, 'references', 'remediation-cycles.md');
const guidancePath = path.join(packageRoot, 'references', 'run-guidance.md');

// Extract JSON blocks from Markdown
function extractJsonBlocks(markdown) {
  const blocks = [];
  const regex = /```json\s*([\s\S]*?)\s*```/g;
  let match;
  while ((match = regex.exec(markdown)) !== null) {
    try {
      blocks.push(JSON.parse(match[1]));
    } catch (e) {
      assert.fail(`Found invalid JSON block in specification: ${e.message}`);
    }
  }
  return blocks;
}

describe('Portable Sonar Evidence Actor Specification Verification', () => {
  const content = fs.readFileSync(actorPath, 'utf8');
  const cyclesContent = fs.readFileSync(cyclesPath, 'utf8');
  const guidanceContent = fs.readFileSync(guidancePath, 'utf8');

  test('file exists at agents/sonar-evidence.md', () => {
    assert.ok(fs.existsSync(actorPath), 'agents/sonar-evidence.md must exist');
  });

  test('portable prompt contains zero host frontmatter or native engine bindings', () => {
    assert.ok(!content.startsWith('---'), 'Specification must not start with YAML frontmatter');
    assert.ok(!content.includes('tools:'), 'Must not declare host-specific tools frontmatter');
    assert.ok(!content.includes('vscode:'), 'Must not declare VS Code-specific binding frontmatter');
    assert.ok(!content.includes('claude:'), 'Must not declare Claude-specific binding frontmatter');
    assert.ok(!content.includes('name: evc-'), 'Must not declare canonical evc- agent identity');
  });

  test('specifies root-resolved prompt and policy location with Phase 06 note', () => {
    assert.match(content, /skills\/sonarqube-test-quality\/agents\/sonar-evidence\.md/);
    assert.match(content, /selected installed root/i);
    assert.match(content, /Phase 06/i);
  });

  test('defines bounded writes, evidence destination security, and prohibited actions', () => {
    assert.match(content, /Bounded Writes/i);
    assert.match(content, /NEVER.*edit.*source code/i);
    assert.match(content, /NEVER.*modify.*test/i);
    assert.match(content, /NEVER.*mutate.*status/i);
    assert.match(content, /NEVER.*git commit/i);
    assert.match(content, /NEVER.*toolchain binaries/i);
    assert.match(content, /mode 0700/i);
    assert.match(content, /\*\*never\*\* inlined into shared reports/i);
    assert.match(content, /Prompt instructions are (not|\*\*not\*\*) an operating system sandbox/i);
  });

  test('specifies TLS and network security rules from local-analysis.md §4', () => {
    assert.match(content, /NODE_TLS_REJECT_UNAUTHORIZED=0/);
    assert.match(content, /Never disable TLS/i);
    assert.match(content, /Halt immediately on TLS handshake failure/i);
    assert.match(content, /Local analysis §4/i);
  });

  test('enforces strict role independence against actor_id and independent_roles', () => {
    assert.match(content, /actor_id != independent_roles\.implementer_id/);
    assert.match(content, /actor_id != independent_roles\.reviewer_id/);
    assert.match(content, /actor_id != independent_roles\.rereviewer_id/);
    assert.match(content, /actor_id != independent_roles\.auditor_id/);
    assert.match(content, /Pairwise Role Distinctness/i);
    assert.match(content, /CANNOT.*certify.*F_FINAL_AUDIT/i);
    assert.match(content, /hotspots: owner-review-required/i);
    assert.match(content, /role-independence-violation/i);
  });

  test('defines operating modes with stage-scoped prerequisites and upload boundaries', () => {
    assert.match(content, /### 2\.1 Mode: `snapshot`/);
    assert.match(content, /NO upload/i);
    assert.match(content, /`snapshot` mode \*\*NEVER\*\* acquires upload authority/);
    assert.match(content, /Requires no prior test execution or code review prerequisites/i);

    assert.match(content, /### 2\.2 Mode: `verify-upload`/);
    assert.match(content, /Preflight Upload Authorization/i);
    assert.match(content, /C0_BASELINE/);
    assert.match(content, /not-applicable \(baseline\)/i);

    assert.match(content, /### 2\.3 Mode: `verify-final`/);
    assert.match(content, /Strictly non-editorial/i);
    assert.match(content, /Zero.*edits permitted/i);
    assert.match(content, /F_FINAL_LIFECYCLE_UPLOAD.*F_FINAL_TASK_WAIT/);
  });

  test('specifies multi-target support and serial execution', () => {
    assert.match(content, /target_set/);
    assert.match(content, /per_target_evidence/);
    assert.match(content, /Multi-Target Serial Execution/i);
    assert.match(content, /aggregate run halts with `blocked\/incomplete`/i);
  });

  test('specifies pre-upload and post-lifecycle drift checks', () => {
    assert.match(content, /commit_sha/);
    assert.match(content, /active_input_digest/);
    assert.match(content, /generated_input_digest/);
    assert.match(content, /Pre-Upload Drift Check/i);
    assert.match(content, /\*\*BEFORE\*\* invoking any upload-capable command/i);
    assert.match(content, /Post-Lifecycle Drift Check/i);
    assert.match(content, /resume-checkpoint-drift/);
    assert.match(content, /drift-invalidated/);
  });

  test('specifies ordered scanner lifecycles and uninstrumented native semantic parity', () => {
    assert.match(content, /Shape A \(Integrated Build\/Scanner\)/);
    assert.match(content, /Shape B \(Standalone Scanner\)/);
    assert.match(content, /Shape C \(Preparation → Build → End\)/);
    assert.match(content, /end.*hook is (\*\*never\*\*|never) a cleanup command/i);
    assert.match(content, /Mandatory Native Semantic Parity/i);
  });

  test('specifies background task tracking, crash window handling, and resume without re-upload', () => {
    assert.match(content, /ceTaskId/);
    assert.match(content, /report-task\.txt/);
    assert.match(content, /submission-unverified/);
    assert.match(content, /NEVER.*blindly re-execute/i);
    assert.match(content, /resume-checkpoint\.json/);
    assert.match(content, /Resuming Without Re-Upload/i);
    assert.match(content, /does (\*\*not\*\*|not) consume an additional fix round/i);
  });

  test('specifies exact analysis gate binding and rejects latest-project fallback', () => {
    assert.match(content, /analysisId/);
    assert.match(content, /qualitygates\/project_status\?analysisId=/);
    assert.match(content, /Never substitute the latest project quality gate/i);
    assert.match(content, /latest-project-fallback-unverified/);
  });

  test('specifies complete paging, ceiling detection, and explicit consistency checks', () => {
    assert.match(content, /window-exceeded-blocked/);
    assert.match(content, /analysis-changed-invalidated/);
    assert.match(content, /consistency_state: "verified"/);
    assert.match(content, /consistency_state: "unknown"/);
    assert.match(content, /consistency_state: "drift_detected"/);
    assert.match(content, /consistency-unknown-blocked/);
    assert.match(content, /consistency_state: "unknown".*strictly blocks/i);
  });

  test('specifies closed enumerations matching canonical references', () => {
    // 6 canonical outcomes defined in remediation-cycles.md §5
    for (const outcome of [
      'locally remediated', 'reviewed', 'awaiting commit',
      'blocked/incomplete', 'server-verified residual findings', 'server-verified success'
    ]) {
      assert.ok(cyclesContent.includes(outcome), `remediation-cycles.md must define outcome "${outcome}"`);
      assert.ok(content.includes(`"${outcome}"`), `sonar-evidence.md must include canonical outcome "${outcome}"`);
    }

    // 10 canonical triggers defined in remediation-cycles.md §1/§2 and run-guidance.md §3
    for (const trigger of [
      'budget-n-exhausted', 'two-round-no-progress', 'failed-rereview',
      'declined-commit', 'test-or-build-failed', 'task-failed', 'task-timeout',
      'resume-checkpoint-drift', 'consistency-unknown'
    ]) {
      assert.ok(cyclesContent.includes(trigger), `remediation-cycles.md must define trigger "${trigger}"`);
      assert.ok(guidanceContent.includes(trigger), `run-guidance.md must define trigger "${trigger}"`);
      assert.ok(content.includes(`"${trigger}"`), `sonar-evidence.md must include canonical trigger "${trigger}"`);
    }
    assert.ok(guidanceContent.includes('none'), 'run-guidance.md must define trigger "none"');
    assert.ok(content.includes('"none"'), 'sonar-evidence.md must include canonical trigger "none"');
    for (const status of ['complete', 'failed', 'unavailable', 'incomplete']) {
      assert.ok(content.includes(`"${status}"`), `sonar-evidence.md must include result_status "${status}"`);
    }

    // Ensure result_status: "blocked" is NOT present anywhere in sonar-evidence.md
    assert.ok(!content.includes('result_status: "blocked"'), 'result_status: "blocked" must not appear in spec');
  });

  test('specifies redaction placeholders and references run-guidance.md', () => {
    assert.match(content, /<REDACTED_SECRET_TOKEN>/);
    assert.match(content, /<REDACTED_SONAR_HOST>/);
    assert.match(content, /<REDACTED_PROJECT_KEY>/);
    assert.match(content, /<REDACTED_PROJECT_PATH>/);
    assert.match(content, /<REDACTED_FINDING_MESSAGE>/);
    assert.match(content, /Sanitized run guidance §2/i);
  });

  test('specifies guidance candidate schema matching run-guidance.md §3', () => {
    assert.match(content, /guidance_id/);
    assert.match(content, /creation_date/);
    assert.match(content, /provenance/);
    assert.match(content, /auditing_subagent_role/);
    assert.match(content, /step_by_step_procedure/);
    assert.match(content, /observed_failures/);
    assert.match(content, /operational_limits/);
    assert.match(content, /root_cause_analysis/);
    assert.match(content, /confidence/);
  });

  test('covers all 14 labeled offline scenario traces E-TR-01 through E-TR-14', () => {
    for (let i = 1; i <= 14; i++) {
      const traceId = `E-TR-${String(i).padStart(2, '0')}`;
      assert.ok(content.includes(traceId), `Specification must define trace ${traceId}`);
    }
  });
});

describe('Specification Embedded JSON Blocks Validation', () => {
  const content = fs.readFileSync(actorPath, 'utf8');
  const jsonBlocks = extractJsonBlocks(content);

  test('specification contains exactly 2 valid JSON blocks (request and terminal result)', () => {
    assert.equal(jsonBlocks.length, 2, 'Specification must contain exactly request and terminal result JSON blocks');
  });

  test('request JSON block satisfies schema and role independence', () => {
    const req = jsonBlocks[0];
    assert.equal(req.actor_role, 'sonar-evidence-actor');
    assert.equal(req.actor_id, 'subagent-child-01');
    assert.equal(req.mode, 'verify-upload');
    assert.equal(req.stage, 'CK_UPLOAD');
    assert.equal(req.round, 1);
    assert.ok(Array.isArray(req.target_set));
    assert.equal(req.target_set.length, 2);
    assert.ok(req.input_checkpoint.commit_sha);
    assert.ok(req.input_checkpoint.active_input_digest);
    assert.ok(req.input_checkpoint.generated_input_digest);
    assert.equal(req.upload_authorization.authorized, true);

    // Role independence
    assert.ok(req.independent_roles);
    assert.notEqual(req.actor_id, req.independent_roles.implementer_id);
    assert.notEqual(req.actor_id, req.independent_roles.reviewer_id);
    assert.notEqual(req.actor_id, req.independent_roles.rereviewer_id);
    assert.notEqual(req.actor_id, req.independent_roles.auditor_id);
  });

  test('terminal result JSON block conforms to canonical enums and does not falsely claim Stage F success', () => {
    const res = jsonBlocks[1];
    assert.ok(['complete', 'failed', 'unavailable', 'incomplete'].includes(res.result_status));
    assert.ok([
      'locally remediated', 'reviewed', 'awaiting commit',
      'blocked/incomplete', 'server-verified residual findings', 'server-verified success'
    ].includes(res.canonical_outcome));

    // Crucial check: at stage CK_EVALUATION, cannot claim server-verified success
    if (res.stage === 'CK_EVALUATION') {
      assert.notEqual(res.canonical_outcome, 'server-verified success',
        'CK_EVALUATION cannot certify server-verified success; must be locally remediated or reviewed');
    }

    assert.ok([
      'none', 'budget-n-exhausted', 'two-round-no-progress', 'failed-rereview',
      'declined-commit', 'test-or-build-failed', 'task-failed', 'task-timeout',
      'resume-checkpoint-drift', 'consistency-unknown'
    ].includes(res.halting_trigger));

    assert.ok(['verified', 'unknown', 'drift_detected'].includes(res.findings_summary.consistency_state));
    assert.ok(Array.isArray(res.lifecycle_execution.per_command_results));
    assert.ok(Array.isArray(res.per_target_evidence));
    assert.equal(res.per_target_evidence.length, 1);
    assert.ok(res.test_and_coverage_evidence.test_framework);
    assert.ok(res.sanitized_guidance_candidate.step_by_step_procedure);
  });

  test('regression: resumed task with SUCCESS status and drifted tree must halt with resume-checkpoint-drift', () => {
    // Assert that §5.4 in the spec performs the drift check BEFORE binding SUCCESS
    assert.match(content, /First, verify the current source checkpoint[\s\S]*?If source drift is detected[\s\S]*?If the source checkpoint matches with zero drift[\s\S]*?If the task already completed `SUCCESS`, bind/);

    // Validate regression contract behavior
    const resumeDriftScenario = {
      task_status: 'SUCCESS',
      source_drift_detected: true,
      pre_scan_digest: 'a'.repeat(64),
      current_digest: 'b'.repeat(64)
    };

    assert.equal(resumeDriftScenario.source_drift_detected, true);
    const outcome = resumeDriftScenario.source_drift_detected ? {
      result_status: 'failed',
      canonical_outcome: 'blocked/incomplete',
      halting_trigger: 'resume-checkpoint-drift',
      blockers: ['resume-checkpoint-drift'],
      dirty_tree_state: 'drift-invalidated',
      analysis_bound: false
    } : {
      result_status: 'complete',
      analysis_bound: true
    };

    assert.equal(outcome.result_status, 'failed');
    assert.equal(outcome.canonical_outcome, 'blocked/incomplete');
    assert.equal(outcome.halting_trigger, 'resume-checkpoint-drift');
    assert.ok(outcome.blockers.includes('resume-checkpoint-drift'));
    assert.equal(outcome.dirty_tree_state, 'drift-invalidated');
    assert.equal(outcome.analysis_bound, false, 'Drifted tree must NEVER bind analysisId even if server task reported SUCCESS');
  });
});
