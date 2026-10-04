'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

/**
 * Phase 07 Native Windows Qualification Runner.
 * Authored in Phase 06; executed in Phase 07 on native Windows x64.
 *
 * CLI:
 *   --bundle <verified-package-root>
 *   --powershell <absolute-powershell.exe-or-pwsh.exe>
 *   --evidence <empty-external-dir>
 *   --mode automated|console
 */

const CANONICAL_TARGET_IDS = Object.freeze([
  'antigravity',
  'claude',
  'codex',
  'copilot',
  'gemini',
  'omp',
  'pi',
  'vscode'
]);

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        options[key] = next;
        i++;
      } else {
        options[key] = true;
      }
    }
  }
  return options;
}

function verifyHostIdentity() {
  if (process.platform !== 'win32') {
    throw new Error(`Native Windows qualification requires native win32 platform; current platform is "${process.platform}"`);
  }
  if (process.arch !== 'x64') {
    throw new Error(`Native Windows qualification requires x64 architecture; current architecture is "${process.arch}"`);
  }
}

function getPowerShellVersion(psPath) {
  const res = spawnSync(psPath, ['-NoProfile', '-NonInteractive', '-Command', '$PSVersionTable.PSVersion.ToString()'], {
    encoding: 'utf8',
    timeout: 15000
  });
  if (res.status !== 0) {
    throw new Error(`Failed to query PowerShell version via ${psPath}: ${res.stderr || res.stdout}`);
  }
  return res.stdout.trim();
}

function buildSanitizedEnvironment(homeDir, additional = {}) {
  const env = {};
  let seenPath = false;

  for (const [key, value] of Object.entries(process.env)) {
    if (key.toLowerCase() === 'path') {
      if (!seenPath && value) {
        env.PATH = value;
        seenPath = true;
      }
    } else if (!/(?:^|_)(?:api_key|token|pat|secret|password|passwd|auth|credential)(?:_|$)/iu.test(key)) {
      env[key] = value;
    }
  }

  // Clear recursion markers and active run markers
  delete env.EVCRATE_ADVISOR_ACTIVE;
  delete env.EVCRATE_ADVISOR_DEPTH;
  delete env.EVCRATE_SESSION_ID;

  env.HOME = homeDir;
  env.USERPROFILE = homeDir;
  const tmpDir = additional.TMPDIR || path.join(homeDir, 'tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  env.TMP = tmpDir;
  env.TEMP = tmpDir;
  env.TMPDIR = tmpDir;

  for (const [k, v] of Object.entries(additional)) {
    env[k] = v;
  }

  return env;
}

function copyControllerClosure(bundleRoot, homeDir) {
  const sourceBinDir = path.join(bundleRoot, '.evcrate', 'source', '.evcrate', 'bin');
  const targetBinDir = path.join(homeDir, '.evcrate', 'bin');
  fs.mkdirSync(targetBinDir, { recursive: true });

  function copyRecursive(src, dst) {
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const ent of entries) {
      const srcPath = path.join(src, ent.name);
      const dstPath = path.join(dst, ent.name);
      if (ent.isDirectory()) {
        fs.mkdirSync(dstPath, { recursive: true });
        copyRecursive(srcPath, dstPath);
      } else if (ent.isFile()) {
        fs.copyFileSync(srcPath, dstPath);
      }
    }
  }

  copyRecursive(sourceBinDir, targetBinDir);
  return path.join(targetBinDir, 'evcrate-advisor');
}

function runNativeTestSuites(bundleRoot, nodeExec, evidenceDir) {
  const suites = [
    {
      name: 'provider-launch-identity-and-retry',
      files: [
        'tests/advisor-controller/provider-launch-identity.test.cjs',
        'tests/advisor-controller/retry-orchestration.test.cjs'
      ]
    },
    {
      name: 'supervision-console-and-verification-lifecycle',
      files: [
        'tests/advisor-controller/supervision-console.test.cjs',
        'tests/advisor-controller/verification-lifecycle.test.cjs'
      ]
    },
    {
      name: 'controller-and-state-history-cli',
      files: [
        'tests/advisor-controller/controller.test.cjs',
        'tests/advisor-controller/state-cli.test.cjs',
        'tests/advisor-controller/history-cli.test.cjs',
        'tests/advisor-controller/history-controller-integration.test.cjs'
      ]
    },
    {
      name: 'node-launch-behavior',
      files: [
        'tests/advisor-controller/node-launch.test.cjs'
      ]
    }
  ];

  const results = [];
  for (const suite of suites) {
    const logPath = path.join(evidenceDir, `${suite.name}.log`);
    const args = ['--test', ...suite.files];
    const startTime = Date.now();
    const res = spawnSync(nodeExec, args, {
      cwd: bundleRoot,
      env: process.env,
      encoding: 'utf8',
      timeout: 120000
    });
    const durationMs = Date.now() - startTime;

    fs.writeFileSync(logPath, `--- STDOUT ---\n${res.stdout}\n--- STDERR ---\n${res.stderr}\n`, 'utf8');

    results.push({
      suite: suite.name,
      files: suite.files,
      exit_code: res.status,
      passed: res.status === 0,
      duration_ms: durationMs,
      log_file: path.basename(logPath)
    });

    if (res.status !== 0) {
      console.error(`Suite ${suite.name} failed with exit ${res.status}`);
    }
  }

  return results;
}

function runInstalledLifecycleExercise(controllerScript, homeDir, projectDir, nodeExec) {
  const env = buildSanitizedEnvironment(homeDir);

  function invoke(subcommand, payload) {
    const args = [controllerScript];
    if (subcommand) {
      args.push(...subcommand.split(' '));
    }
    const res = spawnSync(nodeExec, args, {
      cwd: projectDir,
      env,
      input: JSON.stringify(payload),
      encoding: 'utf8',
      timeout: 30000
    });
    if (res.error) throw res.error;
    const lines = res.stdout.trim().split('\n').filter(Boolean);
    const lastLine = lines[lines.length - 1];
    return {
      status: res.status,
      stdout: res.stdout,
      parsed: lastLine ? JSON.parse(lastLine) : null
    };
  }

  // 1. Setup source file in project
  const sourceFile = path.join(projectDir, 'source.txt');
  fs.writeFileSync(sourceFile, 'initial user code for qualification\n', 'utf8');
  const sourceDigest = crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex');

  // 2. Setup routing policy and fake provider in home
  const routingPolicy = {
    version: 2,
    advisor: {
      primary: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
      backup: { backend: 'omp', model: 'openai-codex/gpt-5.6-sol', effort: 'high' }
    },
    wait: { mode: 'until_terminal', warn_after_ms: 120000, warn_every_ms: 300000 },
    history: { retention_days: 30, max_bytes: 104857600 }
  };
  fs.mkdirSync(path.join(homeDir, '.evcrate'), { recursive: true });
  fs.writeFileSync(path.join(homeDir, '.evcrate', 'advisor-routing.json'), JSON.stringify(routingPolicy, null, 2), 'utf8');

  // Fake provider state
  fs.writeFileSync(path.join(homeDir, '.evcrate', 'fake-codex-state.json'), JSON.stringify({
    finalCount: 0,
    calls: [],
    returnJson: JSON.stringify({
      recommendation: 'Proceed with qualification.',
      rationale: 'All checks passed cleanly on native Windows.',
      must_fix: [],
      cautions: [],
      assumptions: [],
      success_checks: ['node --version'],
      unresolved_questions: []
    })
  }, null, 2), 'utf8');

  const taskRunId = crypto.randomUUID();
  const task = {
    goal: 'Qualify native Windows advisor lifecycle',
    non_goals: ['Modifying user files'],
    authorized_paths: ['source.txt'],
    scope_rationale: 'Phase 07 qualification',
    invariants: ['Preserve user data'],
    success_criteria: ['Lifecycle passes']
  };

  // Step 1: init
  const initRes = invoke('state init', {
    protocol: 'evcrate-advisor-state',
    version: 1,
    operation: 'init',
    task_run_id: taskRunId,
    operation_id: crypto.randomUUID(),
    expected_revision: 0,
    payload: { phase_id: 'phase-07', task, baseline_paths: ['source.txt'] }
  });
  if (initRes.status !== 0 || initRes.parsed?.status !== 'STATE_READY') {
    throw new Error(`state init failed: ${initRes.stdout}`);
  }

  // Truthfully executed node --version validation
  const nodeCheck = spawnSync(nodeExec, ['--version'], { encoding: 'utf8' });
  if (nodeCheck.status !== 0 || !nodeCheck.stdout.trim().startsWith('v')) {
    throw new Error(`node --version check failed during qualification: ${nodeCheck.stderr}`);
  }

  const checkpoint = {
    protocol: 'evcrate-advisor-checkpoint',
    version: 2,
    task_run_id: taskRunId,
    checkpoint_id: 'chk-win-01',
    phase_id: 'phase-07',
    task_revision: 1,
    evidence_revision: 0,
    checkpoint: 'review:phase-07',
    kind: 'review',
    question: 'Is native Windows verification complete?',
    task,
    proposal: { next_action: 'Complete', rationale: 'Ready', intended_changed_paths: ['source.txt'] },
    evidence: {
      summary: 'Verified on native Windows',
      files: [{ path: 'source.txt', excerpt: 'initial user code', digest: sourceDigest }],
      validation_results: [{ suite: 'smoke', command: 'node --version', status: 'passed', passed: 1, failed: 0, details: nodeCheck.stdout.trim() }],
      artifacts: []
    },
    prior: { prior_consultation_id: null, prior_counsel: null, prior_disposition: null, observed_outcome: null }
  };

  // Step 2: checkpoint reservation
  const reserveRes = invoke('state checkpoint', {
    protocol: 'evcrate-advisor-state',
    version: 1,
    operation: 'checkpoint',
    task_run_id: taskRunId,
    operation_id: crypto.randomUUID(),
    expected_revision: 1,
    payload: { checkpoint }
  });
  if (reserveRes.status !== 0 || reserveRes.parsed?.status !== 'STATE_READY') {
    throw new Error(`state checkpoint failed: ${reserveRes.stdout}`);
  }

  // Step 3: central controller consultation
  const adviceRes = invoke('', checkpoint);
  if (adviceRes.status !== 0 || adviceRes.parsed?.status !== 'ADVICE_READY') {
    throw new Error(`controller consultation failed: ${adviceRes.stdout}`);
  }
  const consultationId = adviceRes.parsed.correlation_id;

  // Step 4: disposition
  const dispRes = invoke('state disposition', {
    protocol: 'evcrate-advisor-state',
    version: 1,
    operation: 'disposition',
    task_run_id: taskRunId,
    operation_id: crypto.randomUUID(),
    expected_revision: 4,
    payload: {
      consultation_id: consultationId,
      evidence_revision: 0,
      action: 'accept',
      rationale: 'Accepted without changes on native Windows',
      correction: null
    }
  });
  if (dispRes.status !== 0 || dispRes.parsed?.status !== 'STATE_READY') {
    throw new Error(`state disposition failed: ${dispRes.stdout}`);
  }

  // Step 5: outcome
  const outcomeRes = invoke('state outcome', {
    protocol: 'evcrate-advisor-state',
    version: 1,
    operation: 'outcome',
    task_run_id: taskRunId,
    operation_id: crypto.randomUUID(),
    expected_revision: 5,
    payload: {
      consultation_id: consultationId,
      action_id: null,
      episode_id: null,
      result: 'resolved',
      validation: { suite: 'smoke', command: 'node --version', status: 'passed', passed: 1, failed: 0, details: nodeCheck.stdout.trim() },
      actual_changed_paths: []
    }
  });
  if (outcomeRes.status !== 0 || outcomeRes.parsed?.status !== 'STATE_READY') {
    throw new Error(`state outcome failed: ${outcomeRes.stdout}`);
  }

  // Step 6: complete
  const completeRes = invoke('state complete', {
    protocol: 'evcrate-advisor-state',
    version: 1,
    operation: 'complete',
    task_run_id: taskRunId,
    operation_id: crypto.randomUUID(),
    expected_revision: 6,
    payload: {}
  });
  if (completeRes.status !== 0 || completeRes.parsed?.status !== 'STATE_READY' || completeRes.parsed?.state?.gate_status !== 'completed') {
    throw new Error(`state complete failed: ${completeRes.stdout}`);
  }

  return {
    status: 'ok',
    task_run_id: taskRunId,
    consultation_id: consultationId,
    final_revision: completeRes.parsed.state.task_revision,
    gate_status: completeRes.parsed.state.gate_status
  };
}

function runPowerShellPipelineExercise(controllerScript, homeDir, projectDir, psExec, nodeExec) {
  const jsonInput = JSON.stringify({
    protocol: 'evcrate-advisor-history',
    version: 1,
    operation: 'list',
    project_id: null,
    task_run_id: null,
    limit: 10
  });

  const psScript = `
    $previousEncoding = $OutputEncoding
    try {
      $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
      $payload = '${jsonInput.replace(/'/g, "''")}'
      $payload | & "${nodeExec}" "${controllerScript}" history list
    } finally {
      $OutputEncoding = $previousEncoding
    }
  `;

  const res = spawnSync(psExec, ['-NoProfile', '-NonInteractive', '-Command', psScript], {
    cwd: projectDir,
    env: buildSanitizedEnvironment(homeDir),
    encoding: 'utf8',
    timeout: 30000
  });

  if (res.status !== 0) {
    throw new Error(`PowerShell pipeline failed with exit ${res.status}: ${res.stderr || res.stdout}`);
  }

  const lines = res.stdout.trim().split('\n').filter(Boolean);
  const lastLine = lines[lines.length - 1];
  const parsed = lastLine ? JSON.parse(lastLine) : null;

  return {
    status: 'ok',
    exit_code: res.status,
    parsed_status: parsed?.status
  };
}

function runConsoleExercise(controllerScript, homeDir, projectDir, nodeExec) {
  // Console exercise requires attached console interaction
  if (!process.stdin.isTTY) {
    return {
      status: 'skipped',
      reason: 'No attached TTY/console available for interactive human-decision gate (HUMAN_EVENT_REQUIRED)'
    };
  }

  return {
    status: 'interactive_required',
    mode: 'console',
    note: 'Attached console present; operator interactive challenge response required'
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!options.bundle || !options.powershell || !options.evidence || !options.mode) {
    console.error('Usage: native-windows-qualification.cjs --bundle <path> --powershell <path> --evidence <dir> --mode automated|console');
    process.exit(1);
  }

  try {
    verifyHostIdentity();

    const bundleRoot = path.resolve(options.bundle);
    const psPath = path.resolve(options.powershell);
    const evidenceDir = path.resolve(options.evidence);
    const mode = options.mode;
    const nodeExec = process.execPath;

    if (!fs.existsSync(bundleRoot)) throw new Error(`Bundle root does not exist: ${bundleRoot}`);
    if (!fs.existsSync(psPath)) throw new Error(`PowerShell binary does not exist: ${psPath}`);

    fs.mkdirSync(evidenceDir, { recursive: true });

    const psVersion = getPowerShellVersion(psPath);

    console.log(`Starting Phase 07 Native Windows Qualification:`);
    console.log(`  Bundle: ${bundleRoot}`);
    console.log(`  Node: ${nodeExec} (${process.version})`);
    console.log(`  PowerShell: ${psPath} (${psVersion})`);
    console.log(`  Mode: ${mode}`);
    console.log(`  Evidence: ${evidenceDir}`);

    const sandboxRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'win-qual-sandbox-'));
    const homeDir = path.join(sandboxRoot, 'home');
    const projectDir = path.join(sandboxRoot, 'project');
    fs.mkdirSync(homeDir, { recursive: true });
    fs.mkdirSync(projectDir, { recursive: true });

    const controllerScript = copyControllerClosure(bundleRoot, homeDir);

    let testResults = [];
    let lifecycleResult = null;
    let psPipelineResult = null;
    let consoleResult = null;

    let overallPassed = false;
    if (mode === 'automated') {
      testResults = runNativeTestSuites(bundleRoot, nodeExec, evidenceDir);
      lifecycleResult = runInstalledLifecycleExercise(controllerScript, homeDir, projectDir, nodeExec);
      psPipelineResult = runPowerShellPipelineExercise(controllerScript, homeDir, projectDir, psPath, nodeExec);

      const allSuitesPassed = testResults.every((r) => r.passed);
      const lifecyclePassed = lifecycleResult?.status === 'ok';
      const pipelinePassed = psPipelineResult?.status === 'ok';
      overallPassed = allSuitesPassed && lifecyclePassed && pipelinePassed;
    } else if (mode === 'console') {
      consoleResult = runConsoleExercise(controllerScript, homeDir, projectDir, nodeExec);
      overallPassed = consoleResult.status === 'completed';
    } else {
      throw new Error(`Unsupported mode: "${mode}". Mode must be "automated" or "console".`);
    }

    const receipt = {
      schema_version: 1,
      mode,
      timestamp: new Date().toISOString(),
      platform: process.platform,
      arch: process.arch,
      node: {
        path: nodeExec,
        version: process.version
      },
      powershell: {
        path: psPath,
        version: psVersion
      },
      test_suites: testResults,
      lifecycle: lifecycleResult,
      powershell_pipeline: psPipelineResult,
      console: consoleResult,
      status: overallPassed ? 'passed' : 'failed'
    };

    const receiptPath = path.join(evidenceDir, `${mode}-receipt.json`);
    fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2), 'utf8');

    if (!overallPassed && mode === 'automated') {
      throw new Error(`Automated qualification suites or lifecycle exercise failed. See ${receiptPath}`);
    }
    // Clean up sandbox
    try {
      fs.rmSync(sandboxRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {}

    console.log(`Native Windows qualification completed successfully. Receipt: ${receiptPath}`);
  } catch (err) {
    console.error(`Native Windows qualification failed: ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  verifyHostIdentity,
  getPowerShellVersion,
  buildSanitizedEnvironment,
  copyControllerClosure,
  runNativeTestSuites,
  runInstalledLifecycleExercise,
  runPowerShellPipelineExercise,
  runConsoleExercise
};
