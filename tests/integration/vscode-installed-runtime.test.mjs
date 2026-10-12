import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, cpSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { CompanionAgentProvider } from '../../.cache/evcrate/vscode-model-bindings-dist/agent-provider.js';
import { ScopedBindingStore } from '../../.cache/evcrate/vscode-model-bindings-dist/binding-store.js';
import { fsPathToLocalRootUri } from '../../.cache/evcrate/vscode-model-bindings-dist/installation-roots.js';
import { buildCatalogSnapshot } from '../../.cache/evcrate/vscode-model-bindings-dist/model-catalog.js';
import { RefreshController } from '../../.cache/evcrate/vscode-model-bindings-dist/refresh-controller.js';
import { stageAgentGeneration } from '../../.cache/evcrate/vscode-model-bindings-dist/resource-storage.js';
import { parseArguments } from '../../dist/cli/arguments.js';
import { resolveInvocationContext } from '../../dist/context/invocation-context.js';
import { coordinateVscodeCompanionInstallation } from '../../dist/cli/vscode-companion-installation.js';
import { findEditorOnPath } from '../../dist/cli/vscode-editor-launcher.js';
import { validateCompanionInstallNotice } from '../../dist/adapters/vscode/companion-cli-contracts.js';
const repository = process.cwd();

function createTempDir(prefix = 'vscode-integration-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

function setupMaterializedEnvironment() {
  const root = createTempDir('vscode-installed-env-');
  const projectDir = join(root, 'workspace');
  const foreignCwd = join(root, 'foreign-cwd');
  const pluginDir = join(projectDir, '.evcrate-vscode');

  mkdirSync(projectDir, { recursive: true });
  mkdirSync(foreignCwd, { recursive: true });

  // Copy runtime bundle from source .evcrate-vscode
  const sourceVscode = join(repository, '.evcrate/source/.evcrate-vscode');
  assert.ok(existsSync(sourceVscode), 'Source .evcrate-vscode must exist');
  cpSync(sourceVscode, pluginDir, { recursive: true });

  // Create sample files in workspace
  mkdirSync(join(projectDir, 'src'), { recursive: true });
  mkdirSync(join(projectDir, 'node_modules', 'dep'), { recursive: true });
  mkdirSync(join(projectDir, '.git'), { recursive: true });

  writeFileSync(join(projectDir, 'src', 'index.ts'), 'export const hello = "world";\n');
  writeFileSync(join(projectDir, 'node_modules', 'dep', 'index.js'), 'module.exports = {};\n');
  writeFileSync(join(projectDir, '.git', 'config'), '[core]\n\trepositoryformatversion = 0\n');
  writeFileSync(join(projectDir, '.env'), 'SECRET_TOKEN=xyz123\n');

  const bridgeScript = join(pluginDir, 'evcrate', 'runtime', 'local-hook-bridge.cjs');
  assert.ok(existsSync(bridgeScript), 'Bridge script must be present in materialized environment');

  return {
    root,
    projectDir,
    foreignCwd,
    pluginDir,
    bridgeScript,
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    }
  };
}

// -----------------------------------------------------------------------------
// 1. Live Bridge Process Smoke (Foreign CWD, all 8 events, exit 2 on child error)
// -----------------------------------------------------------------------------
test('vscode-installed-runtime: live bridge smoke handles all 8 events from foreign CWD', () => {
  const env = setupMaterializedEnvironment();
  try {
    const runBridge = (eventName, inputObj) => {
      return spawnSync(process.execPath, [env.bridgeScript, eventName], {
        cwd: env.foreignCwd,
        input: JSON.stringify(inputObj),
        encoding: 'utf8',
        env: { ...process.env, VSCODE_PROJECT_DIR: env.projectDir }
      });
    };

    // 1. SessionStart
    const resStart = runBridge('SessionStart', {
      hook_event_name: 'SessionStart',
      source: 'new',
      session_id: 'session-smoke-01',
      cwd: env.projectDir
    });
    assert.equal(resStart.status, 0);
    const outStart = JSON.parse(resStart.stdout);
    assert.equal(outStart.continue, true);
    assert.equal(outStart.hookSpecificOutput?.hookEventName, 'SessionStart');
    assert.ok(outStart.hookSpecificOutput?.additionalContext);

    // 2. UserPromptSubmit
    const resPrompt = runBridge('UserPromptSubmit', {
      hook_event_name: 'UserPromptSubmit',
      prompt: 'Check repository status',
      session_id: 'session-smoke-01',
      cwd: env.projectDir
    });
    assert.equal(resPrompt.status, 0);
    const outPrompt = JSON.parse(resPrompt.stdout);
    assert.equal(outPrompt.continue, true);

    // 3. PreToolUse - Allowed benign read
    const resPreAllow = runBridge('PreToolUse', {
      hook_event_name: 'PreToolUse',
      tool_name: 'read_file',
      tool_input: { path: 'src/index.ts' },
      cwd: env.projectDir
    });
    assert.equal(resPreAllow.status, 0);
    const outPreAllow = JSON.parse(resPreAllow.stdout);
    assert.equal(outPreAllow.continue, true);
    assert.notEqual(outPreAllow.hookSpecificOutput?.permissionDecision, 'deny');

    // 4. PreToolUse - Scout blocked directory (node_modules)
    const resPreDeny = runBridge('PreToolUse', {
      hook_event_name: 'PreToolUse',
      tool_name: 'read_file',
      tool_input: { path: 'node_modules/dep/index.js' },
      cwd: env.projectDir
    });
    assert.equal(resPreDeny.status, 0);
    const outPreDeny = JSON.parse(resPreDeny.stdout);
    assert.equal(outPreDeny.continue, true);
    assert.equal(outPreDeny.permissionDecision, undefined);
    assert.equal(outPreDeny.hookSpecificOutput?.permissionDecision, 'deny');
    assert.ok(outPreDeny.hookSpecificOutput?.permissionDecisionReason?.includes('Scout policy blocked'));
    // 5. PostToolUse
    const resPost = runBridge('PostToolUse', {
      hook_event_name: 'PostToolUse',
      tool_name: 'read_file',
      tool_input: { path: 'src/index.ts' },
      tool_response: { content: 'export const hello = "world";\n' },
      cwd: env.projectDir
    });
    assert.equal(resPost.status, 0);
    const outPost = JSON.parse(resPost.stdout);
    assert.equal(outPost.continue, true);

    // 6. PreCompact
    const resCompact = runBridge('PreCompact', {
      hook_event_name: 'PreCompact',
      trigger: 'auto',
      session_id: 'session-smoke-01',
      cwd: env.projectDir
    });
    assert.equal(resCompact.status, 0);
    const outCompact = JSON.parse(resCompact.stdout);
    assert.equal(outCompact.continue, true);

    // 7. SubagentStart
    const resSubagentStart = runBridge('SubagentStart', {
      hook_event_name: 'SubagentStart',
      agent_id: 'subagent-42',
      agent_type: 'worker',
      session_id: 'session-smoke-01',
      cwd: env.projectDir
    });
    assert.equal(resSubagentStart.status, 0);
    const outSubagentStart = JSON.parse(resSubagentStart.stdout);
    assert.equal(outSubagentStart.continue, true);

    // 8. SubagentStop - Production no-action
    const resSubagentStop = runBridge('SubagentStop', {
      hook_event_name: 'SubagentStop',
      agent_id: 'subagent-42',
      agent_type: 'worker',
      session_id: 'session-smoke-01',
      cwd: env.projectDir
    });
    assert.equal(resSubagentStop.status, 0);
    const outSubagentStop = JSON.parse(resSubagentStop.stdout);
    assert.equal(outSubagentStop.continue, true);
    assert.equal(outSubagentStop.hookSpecificOutput, undefined);

    // 9. Stop - Production no-action
    const resStop = runBridge('Stop', {
      hook_event_name: 'Stop',
      session_id: 'session-smoke-01',
      cwd: env.projectDir
    });
    assert.equal(resStop.status, 0);
    const outStop = JSON.parse(resStop.stdout);
    assert.equal(outStop.continue, true);
    assert.equal(outStop.hookSpecificOutput, undefined);
  } finally {
    env.cleanup();
  }
});

test('vscode-installed-runtime: security child error exits 2 on malformed or invalid invocations', () => {
  const env = setupMaterializedEnvironment();
  try {
    // Missing input -> exit 2
    const resNoInput = spawnSync(process.execPath, [env.bridgeScript, 'SessionStart'], {
      cwd: env.foreignCwd,
      input: '',
      encoding: 'utf8'
    });
    assert.equal(resNoInput.status, 2);

    // Unregistered hook event argument -> exit 2
    const resBadArg = spawnSync(process.execPath, [env.bridgeScript, 'InvalidEvent'], {
      cwd: env.foreignCwd,
      input: JSON.stringify({ hook_event_name: 'InvalidEvent' }),
      encoding: 'utf8'
    });
    assert.equal(resBadArg.status, 2);

    // Mismatched hook_event_name -> exit 2
    const resMismatch = spawnSync(process.execPath, [env.bridgeScript, 'SessionStart'], {
      cwd: env.foreignCwd,
      input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'read_file' }),
      encoding: 'utf8'
    });
    assert.equal(resMismatch.status, 2);
  } finally {
    env.cleanup();
  }
});

// -----------------------------------------------------------------------------
// 2. Tool-Consumer Integration Harness (Decision Enforcement & Suppression Proof)
// -----------------------------------------------------------------------------
test('vscode-installed-runtime: tool-consumer executes allowed and suppresses denied/unconfirmed operations', () => {
  const env = setupMaterializedEnvironment();
  try {
    class ControlledToolConsumer {
      constructor(bridgePath, projectRoot) {
        this.bridgePath = bridgePath;
        this.projectRoot = projectRoot;
        this.operationCallCounts = {
          read: 0,
          edit: 0
        };
      }

      queryPreToolUse(toolName, toolInput) {
        const res = spawnSync(process.execPath, [this.bridgePath, 'PreToolUse'], {
          cwd: this.projectRoot,
          input: JSON.stringify({
            hook_event_name: 'PreToolUse',
            tool_name: toolName,
            tool_input: toolInput,
            cwd: this.projectRoot
          }),
          encoding: 'utf8'
        });

        if (res.status !== 0) {
          return { permitted: false, reason: 'bridge_failure' };
        }

        try {
          const parsed = JSON.parse(res.stdout);
          const decision = parsed.hookSpecificOutput?.permissionDecision;
          const reason = parsed.hookSpecificOutput?.permissionDecisionReason;
          if (decision === 'deny') {
            return { permitted: false, decision: 'deny', reason };
          }
          if (decision === 'ask') {
            return { permitted: false, decision: 'ask', reason };
          }
          return { permitted: true, decision: 'none' };
        } catch {
          return { permitted: false, reason: 'parse_error' };
        }
      }

      executeRead(relPath, userConsent = false) {
        const query = this.queryPreToolUse('read_file', { path: relPath });
        if (!query.permitted) {
          if (query.decision === 'ask' && userConsent) {
            // User explicitly consented to 'ask'
          } else {
            // Suppressed by policy
            return { executed: false, reason: query.reason || query.decision };
          }
        }

        this.operationCallCounts.read += 1;
        const fullPath = join(this.projectRoot, relPath);
        const content = readFileSync(fullPath, 'utf8');
        return { executed: true, content };
      }

      executeEdit(relPath, newText, userConsent = false) {
        const query = this.queryPreToolUse('edit_file', { path: relPath, edits: [{ newText }] });
        if (!query.permitted) {
          if (query.decision === 'ask' && userConsent) {
            // User explicitly consented
          } else {
            return { executed: false, reason: query.reason || query.decision };
          }
        }

        this.operationCallCounts.edit += 1;
        const fullPath = join(this.projectRoot, relPath);
        writeFileSync(fullPath, newText);
        return { executed: true };
      }
    }

    const consumer = new ControlledToolConsumer(env.bridgeScript, env.projectDir);

    // Case A: Harmless read of benign file -> executed
    const r1 = consumer.executeRead('src/index.ts');
    assert.equal(r1.executed, true);
    assert.ok(r1.content.includes('export const hello'));
    assert.equal(consumer.operationCallCounts.read, 1);

    // Case B: Denied read of scout-blocked path (node_modules) -> suppressed
    const r2 = consumer.executeRead('node_modules/dep/index.js');
    assert.equal(r2.executed, false);
    assert.ok(r2.reason && r2.reason.includes('Scout policy blocked'));
    assert.equal(consumer.operationCallCounts.read, 1, 'Denied operation must not increment execution count');

    // Case C: Denied edit of sensitive .git/config -> suppressed
    const originalGitConfig = readFileSync(join(env.projectDir, '.git', 'config'), 'utf8');
    const e1 = consumer.executeEdit('.git/config', 'MALICIOUS_OVERWRITE');
    assert.equal(e1.executed, false);
    assert.equal(consumer.operationCallCounts.edit, 0, 'Denied edit must not increment execution count');
    assert.equal(readFileSync(join(env.projectDir, '.git', 'config'), 'utf8'), originalGitConfig, 'Target file bytes must remain untouched');

    // Case D: Privacy-sensitive read of .env without consent -> suppressed
    const r3Unconfirmed = consumer.executeRead('.env', false);
    assert.equal(r3Unconfirmed.executed, false);
    assert.ok(r3Unconfirmed.reason && r3Unconfirmed.reason.includes('privacy-sensitive'));
    assert.equal(consumer.operationCallCounts.read, 1);

    // Case E: Privacy-sensitive read of .env with explicit consent -> executed
    const r3Confirmed = consumer.executeRead('.env', true);
    assert.equal(r3Confirmed.executed, true);
    assert.ok(r3Confirmed.content.includes('SECRET_TOKEN'));
    assert.equal(consumer.operationCallCounts.read, 2);
  } finally {
    env.cleanup();
  }
});
test('vscode-installed-runtime: executes hook commands configured in hooks.json from foreign CWD with PLUGIN_ROOT containing spaces', () => {
  const root = createTempDir('vscode-plugin-spaces-');
  try {
    const foreignWorkspace = join(root, 'foreign workspace');
    const installedPluginDir = join(root, 'installed plugins', 'my evcrate plugin');
    mkdirSync(foreignWorkspace, { recursive: true });
    mkdirSync(installedPluginDir, { recursive: true });

    // Copy plugin files to installedPluginDir
    const sourceVscode = join(repository, '.evcrate/source/.evcrate-vscode');
    cpSync(sourceVscode, installedPluginDir, { recursive: true });

    // Read generated hooks.json
    const hooksJsonPath = join(installedPluginDir, 'com.github.copilot', 'hooks', 'hooks.json');
    assert.ok(existsSync(hooksJsonPath), 'hooks.json must exist');
    const hooksConfig = JSON.parse(readFileSync(hooksJsonPath, 'utf8'));

    // Check SessionStart hook command
    const sessionStartEntry = hooksConfig.hooks.SessionStart[0];
    assert.ok(sessionStartEntry.command.includes('${PLUGIN_ROOT}'), 'Command must use ${PLUGIN_ROOT}');

    // Expand ${PLUGIN_ROOT} as VS Code host does
    const expandedCommand = sessionStartEntry.command.replaceAll('${PLUGIN_ROOT}', installedPluginDir);

    // Execute via shell from foreign workspace CWD with PLUGIN_ROOT in env
    const res = spawnSync(expandedCommand, {
      shell: true,
      cwd: foreignWorkspace,
      input: JSON.stringify({
        hook_event_name: 'SessionStart',
        source: 'new',
        session_id: 'installed-test-session',
        cwd: foreignWorkspace
      }),
      encoding: 'utf8',
      env: {
        ...process.env,
        PLUGIN_ROOT: installedPluginDir,
        VSCODE_PROJECT_DIR: foreignWorkspace
      }
    });

    assert.equal(res.status, 0, `Execution failed: ${res.stderr}`);
    const parsed = JSON.parse(res.stdout);
    assert.equal(parsed.continue, true);
    assert.equal(parsed.hookSpecificOutput?.hookEventName, 'SessionStart');

    // Also test PreToolUse hook command
    const preToolEntry = hooksConfig.hooks.PreToolUse[0];
    const expandedPreCommand = preToolEntry.command.replaceAll('${PLUGIN_ROOT}', installedPluginDir);
    const preRes = spawnSync(expandedPreCommand, {
      shell: true,
      cwd: foreignWorkspace,
      input: JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'read_file',
        tool_input: { path: 'any.txt' },
        cwd: foreignWorkspace
      }),
      encoding: 'utf8',
      env: {
        ...process.env,
        PLUGIN_ROOT: installedPluginDir,
        VSCODE_PROJECT_DIR: foreignWorkspace
      }
    });

    assert.equal(preRes.status, 0, `PreToolUse execution failed: ${preRes.stderr}`);
    const preParsed = JSON.parse(preRes.stdout);
    assert.equal(preParsed.continue, true);
    assert.equal(preParsed.permissionDecision, undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function computeTreeDigest(rootDir) {
  function walk(dir) {
    const out = [];
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, ent.name);
      if (ent.isDirectory()) out.push(...walk(full));
      else out.push(full);
    }
    return out;
  }
  const files = walk(rootDir).sort();
  const h = createHash('sha256');
  for (const f of files) {
    const rel = relative(rootDir, f).replace(/\\/gu, '/');
    const digest = createHash('sha256').update(readFileSync(f)).digest('hex');
    h.update(`${rel}:${digest}\n`);
  }
  return { count: files.length, sha256: h.digest('hex') };
}

class SimpleMemento {
  constructor() {
    this.map = new Map();
  }
  get(k, def) {
    return this.map.has(k) ? this.map.get(k) : def;
  }
  async update(k, v) {
    if (v === undefined) this.map.delete(k);
    else this.map.set(k, v);
  }
}

test('vscode-installed-runtime: real projected .evcrate-vscode templates integrate with companion runtime, precedence, immutability, and hash preservation', async () => {
  const env = setupMaterializedEnvironment();
  try {
    const storageDir = join(env.root, 'companion-storage');
    mkdirSync(storageDir, { recursive: true });

    // Static agents directory must not exist in projected .evcrate-vscode
    assert.equal(existsSync(join(env.pluginDir, 'com.github.copilot', 'agents')), false);

    const intentJson = JSON.parse(readFileSync(join(env.pluginDir, 'evcrate', 'agent-intent.json'), 'utf8'));
    const auditJson = JSON.parse(readFileSync(join(env.pluginDir, 'evcrate', 'agent-tool-audit.json'), 'utf8'));
    assert.equal(intentJson.schema, 'evcrate-vscode-agent-intent-v1');
    assert.equal(auditJson.schema, 'evcrate-vscode-agent-tool-audit-v2');
    const actorIds = Object.keys(intentJson.actors).sort();
    assert.equal(actorIds.length, 17);

    const canonicalAgentsDir = join(repository, '.evcrate', 'source', '.claude', 'agents');
    const canonicalBefore = computeTreeDigest(canonicalAgentsDir);
    const publishedBefore = computeTreeDigest(env.pluginDir);

    const globalState = new SimpleMemento();
    const workspaceState = new SimpleMemento();
    const store = new ScopedBindingStore(globalState, workspaceState);
    const provider = new CompanionAgentProvider({
      event: () => ({ dispose: () => {} }),
      fire: () => {},
      dispose: () => {}
    });

    let catalogModels = [
      { vendor: 'copilot', id: 'claude-opus-4', name: 'Claude Opus 4' },
      { vendor: 'copilot', id: 'claude-sonnet-4', name: 'Claude Sonnet 4' },
      { vendor: 'copilot', id: 'claude-haiku-3.5', name: 'Claude Haiku 3.5' },
      { vendor: 'copilot', id: 'gpt-4.1', name: 'GPT-4.1' },
      { vendor: 'copilot', id: 'o3-mini', name: 'o3-mini' }
    ];
    const rootId = fsPathToLocalRootUri(env.projectDir).rootIdentity;

    const controller = new RefreshController({
      instanceUuid: '11111111-2222-4333-8444-555555555555',
      baseStorageFsPath: storageDir,
      debounceMs: 10,
      tryRegisterProvider: () => ({
        qualified: true, authority: 'local-file', remoteAuthority: null, workspaceTrusted: true, proposalSupported: true
      }),
      getActiveProvider: () => provider,
      withdrawProvider: () => provider.withdrawInventory(),
      disposeProvider: () => provider.dispose(),
      getWorkspaceFolderPaths: () => [env.projectDir],
      getCustomHomePath: () => join(env.root, 'no-home'),
      getApprovedRoots: () => new Set([rootId]),
      getExplicitSelectedRootIdentity: () => null,
      getStoredBindings: (rid) => ({
        userRes: store.getUserBindings(),
        rootRes: rid ? store.getRootBindings(rid) : { ok: true, bindings: null }
      }),
      queryCatalog: async (rev) => buildCatalogSnapshot(catalogModels, rev),
      createUri: (fsPath) => {
        const u = fsPathToLocalRootUri(fsPath);
        return { scheme: 'file', authority: '', path: u.path, query: '', fragment: '', fsPath, toString: () => u.rootIdentity };
      },
      watchPluginRoot: () => ({ dispose: () => {} }),
      onErrorMessage: () => {}
    });

    // 1. Bind user tiers for all 3 required tiers -> all 17 actors contributed in gen-1
    await store.saveUserBindings({
      schema: 'evcrate-vscode-bindings-v1',
      revision: 1,
      tiers: {
        opus: { vendor: 'copilot', id: 'claude-opus-4' },
        sonnet: { vendor: 'copilot', id: 'claude-sonnet-4' },
        haiku: { vendor: 'copilot', id: 'claude-haiku-3.5' }
      },
      actors: {}
    });
    await controller.requestRefresh({ reason: 'startup', immediate: true });
    assert.equal(provider.currentResources.length, 17);
    assert.equal(controller.currentGenerationId, 1);

    const gen1Planner = provider.currentResources.find((r) => r.actorId === 'evc-planner');
    const gen1PlannerContent = readFileSync(gen1Planner.fsPath, 'utf8');
    assert.match(gen1PlannerContent, /model:\s*"Claude Opus 4 \(copilot\)"/);

    // 2. Cross-scope precedence: user.actor beats root.tier, root.actor beats user.actor
    await store.saveUserBindings({
      schema: 'evcrate-vscode-bindings-v1',
      revision: 2,
      tiers: {
        opus: { vendor: 'copilot', id: 'claude-opus-4' },
        sonnet: { vendor: 'copilot', id: 'claude-sonnet-4' },
        haiku: { vendor: 'copilot', id: 'claude-haiku-3.5' }
      },
      actors: {
        'evc-planner': { kind: 'model', vendor: 'copilot', id: 'gpt-4.1' }
      }
    });
    await store.saveRootBindings(rootId, {
      schema: 'evcrate-vscode-bindings-v1',
      revision: 1,
      tiers: {
        opus: { vendor: 'copilot', id: 'claude-sonnet-4' }
      },
      actors: {}
    });
    await controller.requestRefresh({ reason: 'bindings-updated', immediate: true });
    assert.equal(controller.currentGenerationId, 2);
    // user.actor (GPT-4.1) beats root.tier (Claude Opus 4) for evc-planner
    assert.equal(controller.lastDiagnosticsReport.diagnostics.actors['evc-planner'].effectiveSource, 'user.actor');
    assert.equal(controller.lastDiagnosticsReport.diagnostics.actors['evc-planner'].renderedSelector, 'GPT-4.1 (copilot)');

    // Now set root.actor for evc-planner -> beats user.actor
    await store.saveRootBindings(rootId, {
      schema: 'evcrate-vscode-bindings-v1',
      revision: 2,
      tiers: {
        opus: { vendor: 'copilot', id: 'claude-sonnet-4' }
      },
      actors: {
        'evc-planner': { kind: 'model', vendor: 'copilot', id: 'o3-mini' }
      }
    });
    await controller.requestRefresh({ reason: 'bindings-updated', immediate: true });
    assert.equal(controller.currentGenerationId, 3);
    assert.equal(controller.lastDiagnosticsReport.diagnostics.actors['evc-planner'].effectiveSource, 'root.actor');
    assert.equal(controller.lastDiagnosticsReport.diagnostics.actors['evc-planner'].renderedSelector, 'o3-mini (copilot)');

    // In-flight gen-1 file on disk remains byte-for-byte identical
    assert.equal(readFileSync(gen1Planner.fsPath, 'utf8'), gen1PlannerContent);

    // Republish (overwrite .evcrate-vscode from source) preserves bindings and canonical/published hashes
    cpSync(join(repository, '.evcrate/source/.evcrate-vscode'), env.pluginDir, { recursive: true });
    await controller.requestRefresh({ reason: 'template-changed', immediate: true });
    assert.equal(controller.lastDiagnosticsReport.diagnostics.actors['evc-planner'].renderedSelector, 'o3-mini (copilot)');

    const canonicalAfter = computeTreeDigest(canonicalAgentsDir);
    const publishedAfter = computeTreeDigest(env.pluginDir);
    assert.deepEqual(canonicalAfter, canonicalBefore, 'Canonical agent files must remain untouched');
    assert.deepEqual(publishedAfter, publishedBefore, 'Published .evcrate-vscode files must remain untouched');
    controller.dispose();
  } finally {
    env.cleanup();
  }
});

test('vscode-installed-runtime: isolated temp-dir VS Code 1.140.0 CLI installs packaged companion VSIX, verifies buildIdentity, and rejects identity mismatch with exit 5', async () => {
  const editorPath = findEditorOnPath(process.env, process.platform);
  assert.ok(editorPath, 'VS Code CLI must be available on PATH for isolated CLI qualification');

  const env = setupMaterializedEnvironment();
  try {
    const isolatedUserDataDir = join(env.root, 'vscode-user-data');
    const isolatedExtensionsDir = join(env.root, 'vscode-extensions');
    mkdirSync(isolatedUserDataDir, { recursive: true });
    mkdirSync(isolatedExtensionsDir, { recursive: true });

    const invocation = parseArguments([
      'publish', '--apply', '--target', 'vscode', '--scope', 'project',
      '--project-root', env.projectDir, '--install-vscode-companion',
      '--vscode-editor', editorPath, '--json'
    ]);
    const context = resolveInvocationContext({ ...invocation.options, projectRoot: env.projectDir });
    const committedResult = {
      protocol: 'evcrate-resource-control',
      protocolVersion: 1,
      requestId: 'req-live-cli-1',
      operation: 'publish.apply',
      status: 'published',
      payload: { action: 'published', scope: 'project', bindings: [] }
    };

    // 1. Fresh install into isolated temp extensions dir
    let stderr1 = '';
    const exit1 = await coordinateVscodeCompanionInstallation(
      invocation,
      context,
      committedResult,
      {
        userDataDirectory: isolatedUserDataDir,
        extensionsDirectory: isolatedExtensionsDir,
        vscodeCompanionConsole: {
          isOutputTTY: false,
          confirm: async () => false,
          writeStderr: (t) => { stderr1 += t; }
        }
      },
      'req-live-cli-1'
    );
    assert.equal(exit1, undefined, `Expected exit1 undefined (0), got ${exit1} with stderr: ${stderr1}`);
    const notice1 = validateCompanionInstallNotice(JSON.parse(stderr1));
    assert.equal(notice1.status, 'installed');
    assert.equal(notice1.exitCode, 0);

    // Verify unpacked extension package.json in isolatedExtensionsDir contains exact buildIdentity
    const installedPkgPath = join(isolatedExtensionsDir, `eigencrate.evcrate-model-bindings-${notice1.version}`, 'package.json');
    assert.equal(existsSync(installedPkgPath), true, 'Unpacked extension package.json must exist in isolated extensions directory');
    const installedPkg = JSON.parse(readFileSync(installedPkgPath, 'utf8'));
    assert.equal(installedPkg.buildIdentity, notice1.buildIdentity);

    // 2. Second run detects already-installed with verified buildIdentity without reinstalling
    let stderr2 = '';
    const exit2 = await coordinateVscodeCompanionInstallation(
      invocation,
      context,
      committedResult,
      {
        userDataDirectory: isolatedUserDataDir,
        extensionsDirectory: isolatedExtensionsDir,
        vscodeCompanionConsole: {
          isOutputTTY: false,
          confirm: async () => false,
          writeStderr: (t) => { stderr2 += t; }
        }
      },
      'req-live-cli-2'
    );
    assert.equal(exit2, undefined);
    const notice2 = validateCompanionInstallNotice(JSON.parse(stderr2));
    assert.equal(notice2.status, 'already-installed');
    assert.equal(notice2.exitCode, 0);

    // 3. Same version (2.11.0) with different buildIdentity on disk triggers manual-setup-required and exit 5
    installedPkg.buildIdentity = 'f'.repeat(64);
    writeFileSync(installedPkgPath, JSON.stringify(installedPkg, null, 2));
    let stderr3 = '';
    const exit3 = await coordinateVscodeCompanionInstallation(
      invocation,
      context,
      committedResult,
      {
        userDataDirectory: isolatedUserDataDir,
        extensionsDirectory: isolatedExtensionsDir,
        vscodeCompanionConsole: {
          isOutputTTY: false,
          confirm: async () => false,
          writeStderr: (t) => { stderr3 += t; }
        }
      },
      'req-live-cli-3'
    );
    assert.equal(exit3, 5);
    const notice3 = validateCompanionInstallNotice(JSON.parse(stderr3));
    assert.equal(notice3.status, 'manual-setup-required');
    assert.equal(notice3.exitCode, 5);
  } finally {
    env.cleanup();
  }
});
