'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { computeDirectoryHash } = require('./linux-verification-sandbox.cjs');

function launcherReceipt(result) {
  try {
    const parsed = JSON.parse(result.stdout);
    return {
      status: parsed.status ?? null,
      operation: parsed.operation ?? null,
      errorCode: parsed.error?.code ?? null,
      errorMessage: parsed.error?.message ?? null
    };
  } catch {
    return { status: null, operation: null, errorCode: null, errorMessage: null };
  }
}

function runLauncher(launcherPath, args, options, label) {
  const result = spawnSync(launcherPath, args, { ...options, timeout: 180000 });
  if (result.status !== 0) {
    throw new Error(`${label} failed: ${JSON.stringify({
      exitStatus: result.status, signal: result.signal ?? null, receipt: launcherReceipt(result)
    })}`);
  }
  return result.stdout;
}

function assertPackageHash(snapshotDir, expectedHash, stage) {
  const actualHash = computeDirectoryHash(snapshotDir);
  if (actualHash !== expectedHash) {
    throw new Error(`Package snapshot mutated during ${stage}! Before: ${expectedHash}, After: ${actualHash}`);
  }
}

function invokeRuntime(args, cwd, env, label) {
  const result = spawnSync(process.execPath, args, {
    cwd, env, input: '{}', encoding: 'utf8', timeout: 60000, maxBuffer: 64 * 1024 * 1024
  });
  if (result.status !== 0) throw new Error(`${label} runtime failed: ${result.stderr || result.stdout}`);
  return result.stdout;
}

function verifyMaterializedRuntimes(homeDir, workspaceDir, sandboxEnv) {
  const runtimeEnv = (extra) => ({ ...sandboxEnv, ...extra });
  const claude = invokeRuntime([path.join(homeDir, '.claude', 'hooks', 'session-init.cjs')], workspaceDir, runtimeEnv({ CLAUDE_PROJECT_DIR: workspaceDir }), 'Claude');
  if (claude.includes('EVCREATE_HOOK_UNAVAILABLE')) throw new Error('Claude could not resolve installed child hooks');
  const codex = JSON.parse(invokeRuntime([path.join(homeDir, '.codex', 'hooks', 'session-start.cjs')], workspaceDir, runtimeEnv({ CODEX_PROJECT_DIR: workspaceDir }), 'Codex'));
  if (codex.hookSpecificOutput?.hookEventName !== 'SessionStart') throw new Error('Codex runtime lost workspace hook semantics');
  const gemini = JSON.parse(invokeRuntime([path.join(homeDir, '.gemini', 'hooks', 'session-start.cjs')], workspaceDir, runtimeEnv({ GEMINI_PROJECT_DIR: workspaceDir }), 'Gemini'));
  if (gemini.hookSpecificOutput?.hookEventName !== 'SessionStart') throw new Error('Gemini runtime lost workspace hook semantics');
  const antigravity = JSON.parse(invokeRuntime([path.join(homeDir, '.gemini', 'config', 'hooks', 'scout-block.cjs')], workspaceDir, runtimeEnv({ AGY_PROJECT_DIR: workspaceDir }), 'Antigravity'));
  if (antigravity.decision !== 'allow') throw new Error('Antigravity runtime did not execute installed hook');
  const ompProgram = [`import { runCanonicalHook } from ${JSON.stringify(`file://${path.join(homeDir, '.omp', 'agent', 'evcrate', 'omp-hook-runtime.ts')}`)};`, `const result = await runCanonicalHook('session-init.cjs', {}, { cwd: ${JSON.stringify(workspaceDir)} });`, 'process.exitCode = result.code;'].join('\n');
  invokeRuntime(['--experimental-strip-types', '--input-type=module', '--eval', ompProgram], workspaceDir, runtimeEnv({}), 'OMP');
  const piProgram = [
    `const { createHookAdapter } = require(${JSON.stringify(path.join(homeDir, '.pi', 'agent', 'extensions', 'evcrate', 'hook-adapter.cjs'))});`,
    `const adapter = createHookAdapter({ agentRoot: ${JSON.stringify(path.join(homeDir, '.pi', 'agent'))} });`,
    `const result = await adapter.run('SessionStart', {}, { cwd: ${JSON.stringify(workspaceDir)} });`,
    `if (!result.additionalContext) throw new Error('Pi runtime failed to produce session context');`,
    `process.stdout.write(JSON.stringify({ agentRoot: adapter.agentRoot, resourceRoot: adapter.resourceRoot }));`
  ].join('\n');
  const pi = JSON.parse(invokeRuntime(['--eval', `(async () => { ${piProgram} })()` ], workspaceDir, runtimeEnv({ PI_CODING_AGENT_DIR: path.join(homeDir, '.pi', 'agent') }), 'Pi'));
  if (pi.agentRoot !== path.join(homeDir, '.pi', 'agent') || pi.resourceRoot !== path.join(homeDir, '.pi', 'agent', 'evcrate')) throw new Error('Pi runtime did not retain installed root identity');
  invokeRuntime([path.join(homeDir, '.copilot', 'evcrate', 'hooks', 'copilot-hook-bridge.cjs'), 'session-start'], workspaceDir, runtimeEnv({ COPILOT_PROJECT_DIR: workspaceDir }), 'Copilot');
}


function verifyInstalledPartialRecovery(snapshotDir, homeDir, projectDir, workspaceDir, stateDir) {
  const api = require(path.join(snapshotDir, 'package', 'dist', 'index.js'));
  const partialProject = path.join(projectDir, 'partial project');
  fs.mkdirSync(partialProject, { recursive: true });
  const context = api.resolveInvocationContext({
    packageRoot: path.join(snapshotDir, 'package'), cwd: workspaceDir, home: homeDir,
    stateHome: path.join(stateDir, 'evcrate'), projectRoot: partialProject, targets: ['omp']
  });
  const request = { scope: 'project', selectedTargets: ['omp'] };
  const homeState = api.publicationStateRoot(homeDir);
  let injected = false;
  try {
    api.publishApply(context, {
      hooks: {
        beforeOperation(operation) {
          if (!injected && operation.target === 'omp') {
            injected = true;
            throw new Error('installed project publication failure fixture');
          }
        }
      }
    }, request);
    throw new Error('Installed partial publication fixture unexpectedly succeeded');
  } catch (error) {
    if (!api.isPublicationPartialError(error) || error.code !== 'PUBLICATION_FAILED') throw error;
    if (error.payload.phases[0]?.status !== 'committed' || error.payload.phases[1]?.status !== 'failed') {
      throw new Error('Installed partial result did not preserve shared/project phase states');
    }
  }
  if (!injected || fs.existsSync(path.join(partialProject, '.omp'))) {
    throw new Error('Installed partial fixture did not roll back project-only materialization');
  }
  const homeStateAfterFailure = computeDirectoryHash(homeState);
  const identity = api.resolvePublicationProjectContext(context).projectIdentity;
  const recovered = api.recoverPublication(context, { scope: 'project', projectIdentity: identity, releaseId: null });
  if (recovered.action !== 'none' || computeDirectoryHash(homeState) !== homeStateAfterFailure) {
    throw new Error('Project recovery touched HOME state');
  }
}

function verifyInstalledLauncherAndInvariance(launcherPath, snapshotDir, workspaceDir, sandboxEnv, homeDir, projectDir, stateDir) {
  const defaultOpts = {
    cwd: workspaceDir,
    env: sandboxEnv,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  };
  const versionJson = JSON.parse(runLauncher(launcherPath, ['version', '--json'], defaultOpts, 'evcrate version'));
  if (versionJson.status !== 'ok') throw new Error(`evcrate version returned unexpected status: ${versionJson.status}`);
  const healthRes = spawnSync(launcherPath, ['health', '--json'], { ...defaultOpts, timeout: 60000 });
  const healthStatus = healthRes.status === 0 ? 'ok' : 'diagnostic-flagged';
  const packageHashBefore = computeDirectoryHash(snapshotDir);

  runLauncher(launcherPath, ['publish', '--dry-run', '--json'], defaultOpts, 'HOME publish dry-run');
  runLauncher(launcherPath, ['publish', '--apply', '--scope', 'home', '--json'], defaultOpts, 'HOME publish apply');
  assertPackageHash(snapshotDir, packageHashBefore, 'HOME publish');

  const expectedTargets = ['.claude', '.copilot', '.omp', '.pi', '.gemini', '.codex', '.agents'];
  for (const target of expectedTargets) {
    if (!fs.existsSync(path.join(homeDir, target))) throw new Error(`Missing expected HOME target projection: ${target}`);
  }
  if (!fs.existsSync(path.join(homeDir, '.gemini', 'config'))) {
    throw new Error('Missing Antigravity HOME remap beneath .gemini/config');
  }
  const controllerBin = path.join(homeDir, '.evcrate', 'bin', 'evcrate-advisor');
  if (!fs.existsSync(controllerBin)) throw new Error('Advisor controller binary missing in published HOME');

  const selectedTargets = ['claude', 'codex', 'pi', 'copilot'];
  const projectStateRoot = path.join(stateDir, 'evcrate', 'project-publication');
  const projectReceiptBefore = {
    homeState: computeDirectoryHash(path.join(homeDir, '.evcrate', 'publication')),
    projectState: computeDirectoryHash(projectStateRoot),
    projectDestination: computeDirectoryHash(projectDir)
  };
  try {
    runLauncher(launcherPath, [
      'publish', '--apply', '--scope', 'project', '--project-root', projectDir, '--json',
      ...selectedTargets.flatMap((target) => ['--target', target])
    ], defaultOpts, 'project publish apply');
  } catch (error) {
    assertPackageHash(snapshotDir, packageHashBefore, 'failed project publish');
    throw new Error(`${error.message}; ${JSON.stringify({
      selectedTargets,
      before: projectReceiptBefore,
      after: {
        homeState: computeDirectoryHash(path.join(homeDir, '.evcrate', 'publication')),
        projectState: computeDirectoryHash(projectStateRoot),
        projectDestination: computeDirectoryHash(projectDir)
      }
    })}`);
  }
  const expectedProjectPaths = ['.claude', '.codex', '.agents', 'AGENTS.md', '.pi', '.copilot'];
  for (const target of expectedProjectPaths) {
    if (!fs.existsSync(path.join(projectDir, target))) throw new Error(`Missing expected project publication path: ${target}`);
  }
  if (fs.existsSync(path.join(projectDir, '.evcrate', 'bin'))) throw new Error('Project publication created a shared controller');
  assertPackageHash(snapshotDir, packageHashBefore, 'project publish');

  verifyMaterializedRuntimes(homeDir, workspaceDir, sandboxEnv);
  assertPackageHash(snapshotDir, packageHashBefore, 'materialized runtime invocation');
  verifyInstalledPartialRecovery(snapshotDir, homeDir, projectDir, workspaceDir, stateDir);
  assertPackageHash(snapshotDir, packageHashBefore, 'partial recovery');

  return {
    healthStatus, packageHashBefore, packageHashAfter: computeDirectoryHash(snapshotDir),
    projectProjectionsVerified: true, runtimeEntrypointsVerified: true, partialRecoveryVerified: true
  };
}

module.exports = { verifyInstalledLauncherAndInvariance };
