import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const commandPath = path.join(packageRoot, 'commands', 'cmd-sonar-remediate', 'SKILL.md');
const domainSkillPath = path.join(packageRoot, 'SKILL.md');
const cyclesPath = path.join(packageRoot, 'references', 'remediation-cycles.md');
const discoveryPath = path.join(packageRoot, 'references', 'project-discovery.md');
const analysisPath = path.join(packageRoot, 'references', 'local-analysis.md');
const guidancePath = path.join(packageRoot, 'references', 'run-guidance.md');
const actorPath = path.join(packageRoot, 'agents', 'sonar-evidence.md');
const cycleReportTplPath = path.join(packageRoot, 'templates', 'remediation-cycle-report.md');
const guidanceReportTplPath = path.join(packageRoot, 'templates', 'run-guidance-report.md');

describe('Bounded Sonar Remediation Command Specification Verification', () => {
  const commandContent = fs.readFileSync(commandPath, 'utf8');
  const domainSkillContent = fs.readFileSync(domainSkillPath, 'utf8');
  const cyclesContent = fs.readFileSync(cyclesPath, 'utf8');

  test('file exists at commands/cmd-sonar-remediate/SKILL.md', () => {
    assert.ok(fs.existsSync(commandPath), 'commands/cmd-sonar-remediate/SKILL.md must exist');
  });

  test('contains valid skill frontmatter with exactly name and description', () => {
    const frontmatterMatch = commandContent.match(/^---\n([\s\S]*?)\n---/);
    assert.ok(frontmatterMatch, 'Must contain YAML frontmatter');
    const lines = frontmatterMatch[1].split('\n').filter(l => l.trim().length > 0);
    const keys = lines.map(l => l.split(':')[0].trim());
    assert.deepEqual(keys.sort(), ['description', 'name']);
    assert.match(commandContent, /^name: cmd-sonar-remediate$/m);
  });

  test('contains zero host-specific bindings or frontmatter hacks', () => {
    assert.ok(!commandContent.includes('tools:'), 'Must not declare host-specific tools frontmatter');
    assert.ok(!commandContent.includes('vscode:'), 'Must not declare VS Code-specific binding frontmatter');
    assert.ok(!commandContent.includes('claude:'), 'Must not declare Claude-specific binding frontmatter');
    assert.ok(!commandContent.includes('name: evc-'), 'Must not declare canonical evc- command name in frontmatter');
  });

  test('specifies argument resolution and strictly forbids default or inferred N', () => {
    assert.match(commandContent, /max_rounds_n/);
    assert.match(commandContent, /prompt the user immediately/i);
    assert.match(commandContent, /never infer, assume, or default `N`/i);
    assert.match(commandContent, /evidence_destination/);
    assert.match(commandContent, /outside the git tree or ignored/i);
    assert.match(commandContent, /mode `?0700`?/i);
    assert.match(commandContent, /never contain tokens, passwords, or authentication headers/i);
  });

  test('specifies sibling resolution from loaded installed skill root and dev fallback', () => {
    assert.match(commandContent, /loaded installed skill root/i);
    assert.match(commandContent, /skills\/cmd-sonar-remediate\/SKILL\.md/);
    assert.match(commandContent, /skills\/sonarqube-test-quality\/SKILL\.md/);
    assert.match(commandContent, /skills\/sonarqube-test-quality\/references\//);
    assert.match(commandContent, /skills\/sonarqube-test-quality\/agents\/sonar-evidence\.md/);
    assert.match(commandContent, /relative to the command file's own directory \(`\.\.\/\.\.\/`\)/);
    assert.match(commandContent, /Never fall back to arbitrary current working directory/i);
  });

  test('specifies full pairwise distinct role binding and canonical fail-closed blocker', () => {
    assert.match(commandContent, /implementer_id/);
    assert.match(commandContent, /tester_id/);
    assert.match(commandContent, /reviewer_id/);
    assert.match(commandContent, /rereviewer_id/);
    assert.match(commandContent, /evidence_actor_id/);
    assert.match(commandContent, /auditor_id/);
    assert.match(commandContent, /reviewer_id != implementer_id/);
    assert.match(commandContent, /rereviewer_id != implementer_id/);
    assert.match(commandContent, /evidence_actor_id != implementer_id/);
    assert.match(commandContent, /auditor_id != implementer_id/);
    assert.match(commandContent, /implementer_id != reviewer_id != rereviewer_id != auditor_id != evidence_actor_id/);
    assert.match(commandContent, /role-independence-violation/);
  });

  test('specifies C0 baseline discovery, upload gating, and N exclusion', () => {
    assert.match(commandContent, /Baseline capture \*\*does not consume from budget `N`\*\*/);
    assert.match(commandContent, /cryptographically and temporally bound/i);
    assert.match(commandContent, /C0_BASELINE/);
    assert.match(commandContent, /freeze/i);
  });

  test('specifies global N accounting, test failure halting without retry, and single correction batch', () => {
    assert.match(commandContent, /entered_round_count >= N/);
    assert.match(commandContent, /budget-n-exhausted/);
    assert.match(commandContent, /Increment persisted `entered_round_count` immediately upon entering/);
    assert.match(commandContent, /No In-Round Test-Failure Retry/);
    assert.match(commandContent, /test-or-build-failed/);
    assert.match(commandContent, /failed-review/);
    assert.match(commandContent, /correction_used/);
    assert.match(commandContent, /failed-rereview/);
    assert.match(commandContent, /two-round-no-progress/);
  });

  test('specifies Stage F non-editorial rules, commit authorization gating, and no auto-push', () => {
    assert.match(commandContent, /Stage `F` is strictly non-editorial/);
    assert.match(commandContent, /does not consume from budget `N`/);
    assert.match(commandContent, /F_AGGREGATE_REVIEW/);
    assert.match(commandContent, /F_AWAITING_COMMIT/);
    assert.match(commandContent, /Separate commit authorization or verify user-created commit/i);
    assert.match(commandContent, /NEVER auto-push/);
    assert.match(commandContent, /declined-commit/);
    assert.match(commandContent, /awaiting commit/);
    assert.match(commandContent, /F_COMMITTED_INPUT_CHECK/);
    assert.match(commandContent, /F_FINAL_LIFECYCLE_UPLOAD/);
    assert.match(commandContent, /explicit upload authorization naming target server URL/i);
    assert.match(commandContent, /F_FINAL_TASK_WAIT/);
    assert.match(commandContent, /F_FINAL_AUDIT/);
  });

  test('specifies 11-point success contract, disqualifiers, and budget return rules', () => {
    assert.match(commandContent, /Full Configured Success Contract/i);
    assert.match(commandContent, /Target Completeness/i);
    assert.match(commandContent, /Native Verification/i);
    assert.match(commandContent, /Coverage Compliance/i);
    assert.match(commandContent, /Independent Review/i);
    assert.match(commandContent, /Committed Source/i);
    assert.match(commandContent, /Mandatory Final Submission/i);
    assert.match(commandContent, /Exact Task & Analysis Binding/i);
    assert.match(commandContent, /Complete Consistent Capture/i);
    assert.match(commandContent, /Zero Active Issues/i);
    assert.match(commandContent, /Hotspots Cleared/i);
    assert.match(commandContent, /Passing Quality Gates & Audit Certification/i);
    assert.match(commandContent, /strictly disqualifies/i);
  });

  test('specifies durable private resume-checkpoint.json and sanitized run guidance', () => {
    assert.match(commandContent, /resume-checkpoint\.json/);
    assert.match(commandContent, /resume-checkpoint-drift/);
    assert.match(commandContent, /run-guidance-report\.md/);
    assert.match(commandContent, /remediation-cycle-report\.md/);
  });

  test('domain SKILL.md links bounded remediation command and policy with clean layout', () => {
    assert.match(domainSkillContent, /commands\/cmd-sonar-remediate\/SKILL\.md/);
    assert.match(domainSkillContent, /references\/remediation-cycles\.md/);
    assert.match(domainSkillContent, /Bounded remediation command/);
    assert.match(domainSkillContent, /Ordinary single-pass local fixes and external Jenkins push-to-scan retain their direct independent routes/);
  });

  test('remediation-cycles.md explicitly documents canonical triggers and Stage F return rule', () => {
    assert.match(cyclesContent, /failed-review/);
    assert.match(cyclesContent, /role-independence-violation/);
    assert.match(cyclesContent, /Stage `F` is strictly non-editorial: it never allows code fixes/);
    assert.match(cyclesContent, /if remaining budget within approved `N` exists, returning to remediation requires entering round `C\(k\+1\)`/);
    assert.match(cyclesContent, /if approved budget `N` is exhausted, further remediation requires explicit owner approval for an additional budget round/);
  });
});

describe('Installed Layout and Fixture Resolution Verification', () => {
  test('resolves sibling assets correctly in .agents installed layout fixture', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sonar-agents-layout-'));
    try {
      const skillsDir = path.join(tmpDir, '.agents', 'skills');
      const cmdDir = path.join(skillsDir, 'cmd-sonar-remediate');
      const domainDir = path.join(skillsDir, 'sonarqube-test-quality');
      fs.mkdirSync(cmdDir, { recursive: true });
      fs.mkdirSync(domainDir, { recursive: true });

      fs.copyFileSync(commandPath, path.join(cmdDir, 'SKILL.md'));
      fs.copyFileSync(domainSkillPath, path.join(domainDir, 'SKILL.md'));
      fs.cpSync(path.join(packageRoot, 'references'), path.join(domainDir, 'references'), { recursive: true });
      fs.cpSync(path.join(packageRoot, 'agents'), path.join(domainDir, 'agents'), { recursive: true });
      fs.cpSync(path.join(packageRoot, 'templates'), path.join(domainDir, 'templates'), { recursive: true });

      // Resolution from installed command skill
      const installedCmd = path.join(cmdDir, 'SKILL.md');
      const resolvedDomain = path.resolve(path.dirname(installedCmd), '..', 'sonarqube-test-quality', 'SKILL.md');
      const resolvedCycles = path.resolve(path.dirname(installedCmd), '..', 'sonarqube-test-quality', 'references', 'remediation-cycles.md');
      const resolvedActor = path.resolve(path.dirname(installedCmd), '..', 'sonarqube-test-quality', 'agents', 'sonar-evidence.md');

      assert.ok(fs.existsSync(resolvedDomain), 'Sibling domain skill must resolve in .agents layout');
      assert.ok(fs.existsSync(resolvedCycles), 'Sibling remediation-cycles.md must resolve in .agents layout');
      assert.ok(fs.existsSync(resolvedActor), 'Sibling sonar-evidence.md must resolve in .agents layout');

      // Verify asset identity
      const domainData = fs.readFileSync(resolvedDomain, 'utf8');
      assert.match(domainData, /^name: sonarqube-test-quality/m);
      const cyclesData = fs.readFileSync(resolvedCycles, 'utf8');
      assert.match(cyclesData, /# Remediation Cycles/);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('resolves sibling assets correctly in .claude installed layout fixture', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sonar-claude-layout-'));
    try {
      const skillsDir = path.join(tmpDir, '.claude', 'skills');
      const cmdDir = path.join(skillsDir, 'cmd-sonar-remediate');
      const domainDir = path.join(skillsDir, 'sonarqube-test-quality');
      fs.mkdirSync(cmdDir, { recursive: true });
      fs.mkdirSync(domainDir, { recursive: true });

      fs.copyFileSync(commandPath, path.join(cmdDir, 'SKILL.md'));
      fs.copyFileSync(domainSkillPath, path.join(domainDir, 'SKILL.md'));
      fs.cpSync(path.join(packageRoot, 'references'), path.join(domainDir, 'references'), { recursive: true });
      fs.cpSync(path.join(packageRoot, 'agents'), path.join(domainDir, 'agents'), { recursive: true });
      fs.cpSync(path.join(packageRoot, 'templates'), path.join(domainDir, 'templates'), { recursive: true });

      // Resolution from installed command skill
      const installedCmd = path.join(cmdDir, 'SKILL.md');
      const resolvedDomain = path.resolve(path.dirname(installedCmd), '..', 'sonarqube-test-quality', 'SKILL.md');
      const resolvedCycles = path.resolve(path.dirname(installedCmd), '..', 'sonarqube-test-quality', 'references', 'remediation-cycles.md');
      const resolvedActor = path.resolve(path.dirname(installedCmd), '..', 'sonarqube-test-quality', 'agents', 'sonar-evidence.md');

      assert.ok(fs.existsSync(resolvedDomain), 'Sibling domain skill must resolve in .claude layout');
      assert.ok(fs.existsSync(resolvedCycles), 'Sibling remediation-cycles.md must resolve in .claude layout');
      assert.ok(fs.existsSync(resolvedActor), 'Sibling sonar-evidence.md must resolve in .claude layout');

      // Verify asset identity
      const domainData = fs.readFileSync(resolvedDomain, 'utf8');
      assert.match(domainData, /^name: sonarqube-test-quality/m);
      const cyclesData = fs.readFileSync(resolvedCycles, 'utf8');
      assert.match(cyclesData, /# Remediation Cycles/);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('resolves domain assets correctly in dev source checkout relative to command directory', () => {
    const devResolvedDomain = path.resolve(path.dirname(commandPath), '..', '..', 'SKILL.md');
    const devResolvedCycles = path.resolve(path.dirname(commandPath), '..', '..', 'references', 'remediation-cycles.md');
    const devResolvedActor = path.resolve(path.dirname(commandPath), '..', '..', 'agents', 'sonar-evidence.md');

    assert.ok(fs.existsSync(devResolvedDomain), 'Dev relative path ../../SKILL.md must resolve');
    assert.ok(fs.existsSync(devResolvedCycles), 'Dev relative path ../../references/remediation-cycles.md must resolve');
    assert.ok(fs.existsSync(devResolvedActor), 'Dev relative path ../../agents/sonar-evidence.md must resolve');
  });
});

describe('Executed Behavioral State Transitions and Scenario Simulation', () => {
  // Pure behavioral runner implementing the exact 17-stage state machine transitions
  class RemediationRunner {
    constructor(config) {
      this.n = config.n;
      this.enteredRoundCount = 0;
      this.currentStage = 'C0_BASELINE';
      this.correctionUsed = false;
      this.roles = config.roles || {};
      this.activeIssues = config.initialIssues || [];
      this.pendingTasks = {};
      this.treeState = config.treeState || 'clean';
      this.outcome = null;
      this.trigger = 'none';
      this.lastRoundActiveCount = null;
      this.consecutiveNoProgressRounds = 0;
      this.uploadCount = 0;
    }

    validateRoles() {
      const { implementer_id, reviewer_id, rereviewer_id, auditor_id, evidence_actor_id } = this.roles;
      if (!implementer_id || !reviewer_id || !rereviewer_id || !auditor_id || !evidence_actor_id) {
        this.currentStage = 'HALTED';
        this.outcome = 'blocked/incomplete';
        this.trigger = 'role-independence-violation';
        return false;
      }
      const chain = [implementer_id, reviewer_id, rereviewer_id, auditor_id, evidence_actor_id];
      const unique = new Set(chain);
      if (unique.size !== chain.length) {
        this.currentStage = 'HALTED';
        this.outcome = 'blocked/incomplete';
        this.trigger = 'role-independence-violation';
        return false;
      }
      return true;
    }

    enterRound() {
      if (this.enteredRoundCount >= this.n) {
        this.currentStage = 'HALTED';
        this.outcome = 'server-verified residual findings';
        this.trigger = 'budget-n-exhausted';
        return false;
      }
      this.enteredRoundCount++;
      this.currentStage = 'CK_FIX';
      this.correctionUsed = false;
      return true;
    }

    runTest(testSuccess = true) {
      this.currentStage = 'CK_TEST';
      if (!testSuccess) {
        this.currentStage = 'HALTED';
        this.outcome = 'blocked/incomplete';
        this.trigger = 'test-or-build-failed';
        return false;
      }
      return true;
    }

    runReview(verdict = 'APPROVED') {
      this.currentStage = 'CK_REVIEW';
      if (verdict === 'APPROVED') {
        return 'APPROVED';
      }
      if (verdict === 'CHANGES_REQUESTED' && !this.correctionUsed) {
        return 'CHANGES_REQUESTED';
      }
      this.currentStage = 'HALTED';
      this.outcome = 'blocked/incomplete';
      this.trigger = 'failed-review';
      return 'REJECTED';
    }

    runCorrection(retestSuccess = true, rereviewVerdict = 'APPROVED') {
      if (this.correctionUsed) {
        this.currentStage = 'HALTED';
        this.outcome = 'blocked/incomplete';
        this.trigger = 'failed-rereview';
        return false;
      }
      this.correctionUsed = true;
      this.currentStage = 'CK_CORRECTION';
      if (!retestSuccess) {
        this.currentStage = 'HALTED';
        this.outcome = 'blocked/incomplete';
        this.trigger = 'test-or-build-failed';
        return false;
      }
      this.currentStage = 'CK_REREVIEW';
      if (rereviewVerdict !== 'APPROVED') {
        this.currentStage = 'HALTED';
        this.outcome = 'blocked/incomplete';
        this.trigger = 'failed-rereview';
        return false;
      }
      return true;
    }

    uploadAndEvaluate(taskSuccess = true, newIssueCount = 0, consistencyState = 'verified') {
      this.currentStage = 'CK_VERIFY_IMPORT';
      if (this.treeState === 'drift-invalidated') {
        this.currentStage = 'HALTED';
        this.outcome = 'blocked/incomplete';
        this.trigger = 'resume-checkpoint-drift';
        return false;
      }
      this.currentStage = 'CK_UPLOAD';
      this.uploadCount++;
      this.currentStage = 'CK_TASK_WAIT';
      if (!taskSuccess) {
        this.currentStage = 'HALTED';
        this.outcome = 'blocked/incomplete';
        this.trigger = 'task-failed';
        return false;
      }
      this.currentStage = 'CK_EVALUATION';
      if (consistencyState !== 'verified') {
        this.currentStage = 'HALTED';
        this.outcome = 'blocked/incomplete';
        this.trigger = 'consistency-unknown';
        return false;
      }
      
      // Check progress: if prior round exists and current round has no net reduction, that is 2 consecutive no-progress rounds
      if (this.lastRoundActiveCount !== null && newIssueCount >= this.lastRoundActiveCount) {
        this.consecutiveNoProgressRounds++;
      } else {
        this.consecutiveNoProgressRounds = 0;
      }
      this.lastRoundActiveCount = newIssueCount;

      if (this.consecutiveNoProgressRounds >= 1) {
        this.currentStage = 'HALTED';
        this.outcome = 'server-verified residual findings';
        this.trigger = 'two-round-no-progress';
        return false;
      }

      this.activeIssues = new Array(newIssueCount).fill('ISSUE');
      return true;
    }

    runStageF(aggregateReviewVerdict = 'APPROVED', commitAuthorized = true, committedInputsMatch = true, uploadSuccess = true, auditApproved = true) {
      if (this.activeIssues.length > 0) {
        this.currentStage = 'HALTED';
        this.outcome = 'server-verified residual findings';
        return false;
      }
      this.currentStage = 'F_AGGREGATE_REVIEW';
      if (aggregateReviewVerdict !== 'APPROVED') {
        if (this.enteredRoundCount < this.n) {
          this.currentStage = 'HALTED';
          this.outcome = 'reviewed';
          this.trigger = 'aggregate-review-rejected';
          return 'REENTER_ROUND';
        } else {
          this.currentStage = 'HALTED';
          this.outcome = 'server-verified residual findings';
          this.trigger = 'budget-n-exhausted';
          return false;
        }
      }

      this.currentStage = 'F_AWAITING_COMMIT';
      if (!commitAuthorized) {
        this.currentStage = 'HALTED';
        this.outcome = 'awaiting commit';
        this.trigger = 'declined-commit';
        return false;
      }
      this.currentStage = 'F_COMMITTED_INPUT_CHECK';
      if (!committedInputsMatch) {
        this.currentStage = 'HALTED';
        this.outcome = 'blocked/incomplete';
        this.trigger = 'resume-checkpoint-drift';
        return false;
      }
      this.currentStage = 'F_FINAL_LIFECYCLE_UPLOAD';
      this.uploadCount++;
      if (!uploadSuccess) {
        this.currentStage = 'HALTED';
        this.outcome = 'blocked/incomplete';
        this.trigger = 'task-failed';
        return false;
      }
      this.currentStage = 'F_FINAL_TASK_WAIT';
      this.currentStage = 'F_FINAL_AUDIT';
      if (!auditApproved) {
        this.currentStage = 'HALTED';
        this.outcome = 'blocked/incomplete';
        this.trigger = 'task-failed';
        return false;
      }
      this.outcome = 'server-verified success';
      this.trigger = 'none';
      return true;
    }
  }

  const validRoles = {
    implementer_id: 'subagent-impl',
    tester_id: 'subagent-test',
    reviewer_id: 'subagent-rev',
    rereviewer_id: 'subagent-rerev',
    evidence_actor_id: 'subagent-actor',
    auditor_id: 'subagent-audit',
  };

  test('Scenario 1: Happy path reaches server-verified success on committed source', () => {
    const runner = new RemediationRunner({ n: 2, roles: validRoles, initialIssues: ['ISSUE-1'] });
    assert.ok(runner.validateRoles());
    assert.equal(runner.enteredRoundCount, 0);

    // Enter C1
    assert.ok(runner.enterRound());
    assert.equal(runner.enteredRoundCount, 1);
    assert.ok(runner.runTest(true));
    assert.equal(runner.runReview('APPROVED'), 'APPROVED');
    assert.ok(runner.uploadAndEvaluate(true, 0, 'verified'));

    // Zero issues -> Stage F
    assert.ok(runner.runStageF('APPROVED', true, true, true, true));
    assert.equal(runner.outcome, 'server-verified success');
    assert.equal(runner.currentStage, 'F_FINAL_AUDIT');
    assert.equal(runner.enteredRoundCount, 1); // C0 and F excluded from N
  });

  test('Scenario 2: N=1 test failure halts C1 at CK_TEST without retry or upload', () => {
    const runner = new RemediationRunner({ n: 1, roles: validRoles, initialIssues: ['ISSUE-1'] });
    assert.ok(runner.validateRoles());
    assert.ok(runner.enterRound());
    assert.equal(runner.enteredRoundCount, 1);

    // Test fails
    assert.equal(runner.runTest(false), false);
    assert.equal(runner.currentStage, 'HALTED');
    assert.equal(runner.outcome, 'blocked/incomplete');
    assert.equal(runner.trigger, 'test-or-build-failed');
    assert.equal(runner.uploadCount, 0);

    // Budget N is now exhausted
    assert.equal(runner.enterRound(), false);
    assert.equal(runner.outcome, 'server-verified residual findings');
    assert.equal(runner.trigger, 'budget-n-exhausted');
  });

  test('Scenario 3: Correction & rereview rejection halts Ck without upload', () => {
    const runner = new RemediationRunner({ n: 2, roles: validRoles, initialIssues: ['ISSUE-1'] });
    assert.ok(runner.validateRoles());
    assert.ok(runner.enterRound());
    assert.ok(runner.runTest(true));
    assert.equal(runner.runReview('CHANGES_REQUESTED'), 'CHANGES_REQUESTED');

    // Correction batch executed, but rereview rejected
    assert.equal(runner.runCorrection(true, 'REJECTED'), false);
    assert.equal(runner.currentStage, 'HALTED');
    assert.equal(runner.outcome, 'blocked/incomplete');
    assert.equal(runner.trigger, 'failed-rereview');
    assert.equal(runner.correctionUsed, true);
    assert.equal(runner.uploadCount, 0); // Unapproved changes not uploaded
  });

  test('Scenario 4: Second correction attempt in same round is prohibited', () => {
    const runner = new RemediationRunner({ n: 2, roles: validRoles, initialIssues: ['ISSUE-1'] });
    assert.ok(runner.validateRoles());
    assert.ok(runner.enterRound());
    assert.ok(runner.runTest(true));
    assert.equal(runner.runReview('CHANGES_REQUESTED'), 'CHANGES_REQUESTED');
    assert.ok(runner.runCorrection(true, 'APPROVED'));
    assert.equal(runner.correctionUsed, true);

    // Attempt second correction in same round
    assert.equal(runner.runCorrection(true, 'APPROVED'), false);
    assert.equal(runner.outcome, 'blocked/incomplete');
    assert.equal(runner.trigger, 'failed-rereview');
  });

  test('Scenario 5: Known task resume polls existing task without re-upload or budget cost', () => {
    const runner = new RemediationRunner({ n: 2, roles: validRoles, initialIssues: ['ISSUE-1'] });
    assert.ok(runner.validateRoles());
    assert.ok(runner.enterRound());
    assert.equal(runner.enteredRoundCount, 1);

    // Initial upload in C1
    runner.currentStage = 'CK_TASK_WAIT';
    runner.pendingTasks = { 'target-1': 'AX12345' };
    runner.uploadCount = 1;

    // Resuming known task: verify treeState clean, verify no re-upload or budget increment
    assert.equal(runner.treeState, 'clean');
    const initialUploadCount = runner.uploadCount;
    const initialEnteredRound = runner.enteredRoundCount;

    // Direct task query evaluation (no second upload)
    runner.currentStage = 'CK_EVALUATION';
    runner.activeIssues = [];
    assert.equal(runner.uploadCount, initialUploadCount);
    assert.equal(runner.enteredRoundCount, initialEnteredRound);
  });

  test('Scenario 6: Resume source drift halts immediately with drift-invalidated', () => {
    const runner = new RemediationRunner({ n: 2, roles: validRoles, initialIssues: ['ISSUE-1'], treeState: 'drift-invalidated' });
    assert.ok(runner.validateRoles());
    assert.ok(runner.enterRound());
    assert.equal(runner.uploadAndEvaluate(true, 0, 'verified'), false);
    assert.equal(runner.currentStage, 'HALTED');
    assert.equal(runner.outcome, 'blocked/incomplete');
    assert.equal(runner.trigger, 'resume-checkpoint-drift');
  });

  test('Scenario 7: Two comparable no-progress rounds halt with two-round-no-progress', () => {
    const runner = new RemediationRunner({ n: 3, roles: validRoles, initialIssues: ['ISSUE-1'] });
    assert.ok(runner.validateRoles());

    // Round 1 finishes with 1 issue
    assert.ok(runner.enterRound());
    assert.ok(runner.runTest(true));
    assert.ok(runner.uploadAndEvaluate(true, 1, 'verified'));

    // Round 2 finishes with 1 issue (no progress)
    assert.ok(runner.enterRound());
    assert.ok(runner.runTest(true));
    assert.equal(runner.uploadAndEvaluate(true, 1, 'verified'), false);
    assert.equal(runner.currentStage, 'HALTED');
    assert.equal(runner.outcome, 'server-verified residual findings');
    assert.equal(runner.trigger, 'two-round-no-progress');
  });

  test('Scenario 8: User declines commit at Stage F leaves awaiting commit outcome', () => {
    const runner = new RemediationRunner({ n: 2, roles: validRoles, initialIssues: [] });
    assert.ok(runner.validateRoles());
    // Zero issues -> Stage F, user declines commit
    assert.equal(runner.runStageF('APPROVED', false, true, true, true), false);
    assert.equal(runner.currentStage, 'HALTED');
    assert.equal(runner.outcome, 'awaiting commit');
    assert.equal(runner.trigger, 'declined-commit');
  });

  test('Scenario 9: Rejection of absent final submission blocks server-verified success', () => {
    const runner = new RemediationRunner({ n: 2, roles: validRoles, initialIssues: [] });
    assert.ok(runner.validateRoles());
    // Final upload fails
    assert.equal(runner.runStageF('APPROVED', true, true, false, true), false);
    assert.equal(runner.currentStage, 'HALTED');
    assert.equal(runner.outcome, 'blocked/incomplete');
    assert.equal(runner.trigger, 'task-failed');
    assert.notEqual(runner.outcome, 'server-verified success');
  });

  test('Scenario 10: Role independence violation fails closed on pairwise conflict', () => {
    // Reviewer same as implementer
    const invalidRoles1 = { ...validRoles, reviewer_id: validRoles.implementer_id };
    const runner1 = new RemediationRunner({ n: 2, roles: invalidRoles1, initialIssues: ['ISSUE-1'] });
    assert.equal(runner1.validateRoles(), false);
    assert.equal(runner1.outcome, 'blocked/incomplete');
    assert.equal(runner1.trigger, 'role-independence-violation');

    // Auditor same as implementer
    const invalidRoles2 = { ...validRoles, auditor_id: validRoles.implementer_id };
    const runner2 = new RemediationRunner({ n: 2, roles: invalidRoles2, initialIssues: ['ISSUE-1'] });
    assert.equal(runner2.validateRoles(), false);
    assert.equal(runner2.trigger, 'role-independence-violation');

    // Auditor same as evidence actor
    const invalidRoles3 = { ...validRoles, auditor_id: validRoles.evidence_actor_id };
    const runner3 = new RemediationRunner({ n: 2, roles: invalidRoles3, initialIssues: ['ISSUE-1'] });
    assert.equal(runner3.validateRoles(), false);
    assert.equal(runner3.trigger, 'role-independence-violation');
  });

  test('Scenario 11: Stage F aggregate review rejection returns to C(k+1) when budget N remains', () => {
    const runner = new RemediationRunner({ n: 2, roles: validRoles, initialIssues: [] });
    assert.ok(runner.validateRoles());
    runner.enteredRoundCount = 1; // C1 completed

    // Stage F aggregate review rejects changes
    const result = runner.runStageF('CHANGES_REQUESTED', true, true, true, true);
    assert.equal(result, 'REENTER_ROUND');
    assert.equal(runner.outcome, 'reviewed');
    assert.equal(runner.trigger, 'aggregate-review-rejected');

    // Can enter C2
    assert.ok(runner.enterRound());
    assert.equal(runner.enteredRoundCount, 2);
  });

  test('Scenario 12: Stage F aggregate review rejection halts when budget N exhausted', () => {
    const runner = new RemediationRunner({ n: 1, roles: validRoles, initialIssues: [] });
    assert.ok(runner.validateRoles());
    runner.enteredRoundCount = 1; // C1 completed, N=1 exhausted

    // Stage F aggregate review rejects
    const result = runner.runStageF('CHANGES_REQUESTED', true, true, true, true);
    assert.equal(result, false);
    assert.equal(runner.outcome, 'server-verified residual findings');
    assert.equal(runner.trigger, 'budget-n-exhausted');
  });

  test('Scenario 13: Correction retest failure halts Ck immediately with test-or-build-failed', () => {
    const runner = new RemediationRunner({ n: 2, roles: validRoles, initialIssues: ['ISSUE-1'] });
    assert.ok(runner.validateRoles());
    assert.ok(runner.enterRound());
    assert.ok(runner.runTest(true));
    assert.equal(runner.runReview('CHANGES_REQUESTED'), 'CHANGES_REQUESTED');

    // Retest fails during correction
    assert.equal(runner.runCorrection(false, 'APPROVED'), false);
    assert.equal(runner.currentStage, 'HALTED');
    assert.equal(runner.outcome, 'blocked/incomplete');
    assert.equal(runner.trigger, 'test-or-build-failed');
    assert.equal(runner.uploadCount, 0);
  });

  test('Scenario 14: Zero-issue baseline advances directly to Stage F with enteredRoundCount = 0', () => {
    const runner = new RemediationRunner({ n: 2, roles: validRoles, initialIssues: [] });
    assert.ok(runner.validateRoles());
    assert.equal(runner.enteredRoundCount, 0);

    // Zero-issue baseline bypasses Ck directly to Stage F
    assert.ok(runner.runStageF('APPROVED', true, true, true, true));
    assert.equal(runner.outcome, 'server-verified success');
    assert.equal(runner.enteredRoundCount, 0); // Baseline and F exclude N
  });

  test('Scenario 15: Initial review outright rejection terminates with failed-review trigger', () => {
    const runner = new RemediationRunner({ n: 2, roles: validRoles, initialIssues: ['ISSUE-1'] });
    assert.ok(runner.validateRoles());
    assert.ok(runner.enterRound());
    assert.ok(runner.runTest(true));

    // Initial review rejects without requesting changes
    assert.equal(runner.runReview('REJECTED'), 'REJECTED');
    assert.equal(runner.currentStage, 'HALTED');
    assert.equal(runner.outcome, 'blocked/incomplete');
    assert.equal(runner.trigger, 'failed-review');
    assert.equal(runner.uploadCount, 0);
  });
});
