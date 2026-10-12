import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  inspectHostGuard,
  inspectCandidateRoot,
  readHostRemoteAuthority,
  resolveCandidateRoots
} from '../../.cache/evcrate/vscode-model-bindings-dist/installation-roots.js';
import {
  renderAgentTemplate
} from '../../.cache/evcrate/vscode-model-bindings-dist/agent-renderer.js';
import {
  loadAndStageGeneration,
  validateSafeTemplatePath
} from '../../.cache/evcrate/vscode-model-bindings-dist/generation-loader.js';

test('installation-roots: inspectHostGuard enforces remote authority, trust, and proposal guards', () => {
  const remote = inspectHostGuard({ remoteAuthority: 'ssh-remote+myserver', workspaceTrusted: true, hasProposal: true });
  assert.equal(remote.qualified, false);
  assert.equal(remote.authority, 'unsupported-remote');

  const untrusted = inspectHostGuard({ remoteAuthority: null, workspaceTrusted: false, hasProposal: true });
  assert.equal(untrusted.qualified, false);
  assert.equal(untrusted.authority, 'local-file');

  const noProposal = inspectHostGuard({ remoteAuthority: null, workspaceTrusted: true, hasProposal: false });
  assert.equal(noProposal.qualified, false);

  const qualified = inspectHostGuard({ remoteAuthority: null, workspaceTrusted: true, hasProposal: true });
  assert.equal(qualified.qualified, true);

  // VS Code 1.140.0 throws on vscode.env.remoteAuthority when 'resolvers' proposal is not enabled;
  // readHostRemoteAuthority reads stable remoteName and catches proposal-gated remoteAuthority throws.
  const throwingLocalEnv = {
    remoteName: undefined,
    get remoteAuthority() {
      throw new Error("Extension 'eigencrate.evcrate-model-bindings' CANNOT use API proposal: resolvers.");
    }
  };
  assert.equal(readHostRemoteAuthority(throwingLocalEnv), undefined);
  assert.equal(readHostRemoteAuthority({ remoteName: 'ssh-remote' }), 'ssh-remote');
});
test('installation-roots: candidate root inspection and resolution without silent HOME fallback', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'evc-roots-test-'));
  try {
    const projDir = join(tmp, 'proj');
    const homeDir = join(tmp, 'home-plugin');
    mkdirSync(projDir, { recursive: true });
    mkdirSync(join(homeDir, 'evcrate', 'agent-templates'), { recursive: true });
    writeFileSync(join(homeDir, 'evcrate', 'agent-intent.json'), '{}');

    const candidateHome = inspectCandidateRoot(homeDir, false, false);
    assert.equal(candidateHome.present, true);
    assert.equal(candidateHome.valid, true);

    const pluginDir = join(projDir, '.evcrate-vscode', 'evcrate');
    mkdirSync(join(pluginDir, 'agent-templates'), { recursive: true });
    writeFileSync(join(pluginDir, 'agent-intent.json'), JSON.stringify({ schema: 'evcrate-vscode-agent-intent-v1' }));

    const resolvedProj = resolveCandidateRoots({
      workspaceFolderPaths: [projDir],
      customHomePath: homeDir,
      workspaceTrusted: true,
      remoteAuthority: null
    });
    assert.equal(resolvedProj.source, 'project');
    assert.equal(resolvedProj.pluginFsPath, join(projDir, '.evcrate-vscode'));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('agent-renderer: renderAgentTemplate preserves frontmatter and protects code fences', () => {
  const sampleTemplate = `---\nname: evc-planner\nmetadata:\n  model: "preserve"\nuser-invocable: true\n---\n\nPlanner text.\n\`\`\`\n./.evcrate-vscode/ref.md\n\`\`\`\n`;
  const rendered = renderAgentTemplate({
    actorId: 'evc-planner',
    templateContent: sampleTemplate,
    modelSelector: 'Claude Sonnet (anthropic)',
    pluginFsPath: '/work/.evcrate-vscode'
  });
  assert.match(rendered.content, /model:\s*"Claude Sonnet \(anthropic\)"/);
  assert.match(rendered.content, /model:\s*"preserve"/);
  assert.match(rendered.content, /```\n\.\/\.evcrate-vscode\/ref\.md\n```/);
});

test('generation-loader: loadAndStageGeneration validates paths, hashes, symlinks, and dedupes', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'evc-loader-test-'));
  try {
    const pluginDir = join(tmp, 'plugin');
    const storageDir = join(tmp, 'storage');
    const tplDir = join(pluginDir, 'evcrate', 'agent-templates');
    mkdirSync(tplDir, { recursive: true });
    mkdirSync(storageDir, { recursive: true });

    assert.throws(() => validateSafeTemplatePath(pluginDir, '../escape.md'), { code: 'PATH_UNSAFE' });

    const tplContent = '---\nname: evc-planner\n---\nBody text';
    const tplDigest = createHash('sha256').update(tplContent, 'utf8').digest('hex');
    writeFileSync(join(tplDir, 'evc-planner.md'), tplContent);

    const manifest = {
      schema: 'evcrate-vscode-agent-intent-v1',
      actors: {
        'evc-planner': { templatePath: 'evcrate/agent-templates/evc-planner.md', templateSha256: tplDigest },
        'evc-bad-hash': { templatePath: 'evcrate/agent-templates/evc-planner.md', templateSha256: '0'.repeat(64) }
      }
    };
    writeFileSync(join(pluginDir, 'evcrate', 'agent-intent.json'), JSON.stringify(manifest));

    const res1 = loadAndStageGeneration({
      pluginFsPath: pluginDir,
      baseStorageFsPath: storageDir,
      rootIdentity: 'file:///work/proj',
      instanceUuid: '11111111-2222-4333-8444-555555555555',
      generationId: 1,
      currentUsage: { activeInstanceGenerations: 0, activeInstanceBytes: 0, persistentAuthorityBytes: 0 }
    });
    assert.equal(res1.contributedCount, 1);
    assert.equal(res1.withheldReasons['evc-bad-hash'], 'HASH_MISMATCH');
    assert.ok(res1.staged);

    // Identical inventory hash skips staging
    const res2 = loadAndStageGeneration({
      pluginFsPath: pluginDir,
      baseStorageFsPath: storageDir,
      rootIdentity: 'file:///work/proj',
      instanceUuid: '11111111-2222-4333-8444-555555555555',
      generationId: 2,
      activeInventoryKey: res1.inventoryKey,
      currentUsage: { activeInstanceGenerations: 1, activeInstanceBytes: 100, persistentAuthorityBytes: 100 }
    });
    assert.equal(res2.staged, null);
    assert.equal(res2.contributedCount, 1);

    // syncPluginAgentsDir materializes com.github.copilot/agents/*.agent.md for unbound/bound and cleans missing
    writeFileSync(join(pluginDir, 'evcrate', 'agent-intent.json'), JSON.stringify({
      schema: 'evcrate-vscode-agent-intent-v1',
      actors: { 'evc-planner': { templatePath: 'evcrate/agent-templates/evc-planner.md', templateSha256: tplDigest, intent: { mode: 'tier', tier: 'opus' } } }
    }));
    const baseSync = { pluginFsPath: pluginDir, baseStorageFsPath: storageDir, rootIdentity: 'file:///work/proj', instanceUuid: '11111111-2222-4333-8444-555555555555', syncPluginAgentsDir: true };
    const resSyncUnbound = loadAndStageGeneration({ ...baseSync, generationId: 3, currentUsage: { activeInstanceGenerations: 1, activeInstanceBytes: 100, persistentAuthorityBytes: 100 } });
    const syncedAgentPath = join(pluginDir, 'com.github.copilot', 'agents', 'evc-planner.agent.md');
    assert.equal(resSyncUnbound.contributedCount, 1);
    assert.equal(readFileSync(syncedAgentPath, 'utf8').includes('model:'), false);

    const resSyncBound = loadAndStageGeneration({
      ...baseSync, generationId: 4,
      userBindings: { schema: 'evcrate-vscode-bindings-v1', revision: 1, tiers: { opus: { vendor: 'copilot', id: 'gpt-5.6-luna' } }, actors: {} },
      catalog: [{ vendor: 'copilot', id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna' }],
      currentUsage: { activeInstanceGenerations: 2, activeInstanceBytes: 200, persistentAuthorityBytes: 200 }
    });
    assert.equal(resSyncBound.contributedCount, 1);
    assert.match(readFileSync(syncedAgentPath, 'utf8'), /model:\s*"GPT-5\.6 Luna \(copilot\)"/);

    const resSyncMissing = loadAndStageGeneration({
      ...baseSync, generationId: 5,
      userBindings: { schema: 'evcrate-vscode-bindings-v1', revision: 2, tiers: { opus: { vendor: 'copilot', id: 'nonexistent-model' } }, actors: {} },
      catalog: [{ vendor: 'copilot', id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna' }],
      currentUsage: { activeInstanceGenerations: 3, activeInstanceBytes: 300, persistentAuthorityBytes: 300 }
    });
    assert.equal(resSyncMissing.contributedCount, 0);
    assert.equal(resSyncMissing.withheldReasons['evc-planner'], 'MODEL_NOT_FOUND');
    assert.equal(existsSync(syncedAgentPath), false);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
