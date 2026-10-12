import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const { loadAndStageGeneration } = await import('../../.cache/evcrate/vscode-model-bindings-dist/generation-loader.js');

test('loadAndStageGeneration renders models when bound and withholds unbound tiers', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'evc-loader-models-'));
  try {
    const pluginDir = join(tmp, 'plugin');
    const storageDir = join(tmp, 'storage');
    const tplDir = join(pluginDir, 'evcrate', 'agent-templates');
    mkdirSync(tplDir, { recursive: true });
    mkdirSync(storageDir, { recursive: true });

    const plannerTpl = '---\nname: evc-planner\n---\nPlanner body';
    const designerTpl = '---\nname: evc-ui-ux-designer\n---\nDesigner body';
    const plannerSha = createHash('sha256').update(plannerTpl, 'utf8').digest('hex');
    const designerSha = createHash('sha256').update(designerTpl, 'utf8').digest('hex');

    writeFileSync(join(tplDir, 'evc-planner.md'), plannerTpl);
    writeFileSync(join(tplDir, 'evc-ui-ux-designer.md'), designerTpl);

    const manifest = {
      schema: 'evcrate-vscode-agent-intent-v1',
      actors: {
        'evc-planner': {
          templatePath: 'evcrate/agent-templates/evc-planner.md',
          templateSha256: plannerSha,
          intent: { mode: 'tier', tier: 'opus' }
        },
        'evc-ui-ux-designer': {
          templatePath: 'evcrate/agent-templates/evc-ui-ux-designer.md',
          templateSha256: designerSha,
          intent: { mode: 'inherit', tier: null }
        }
      }
    };
    writeFileSync(join(pluginDir, 'evcrate', 'agent-intent.json'), JSON.stringify(manifest));

    const catalog = [{ vendor: 'copilot', id: 'claude-3-opus', name: 'Claude 3 Opus' }];

    // 1. Unbound opus tier -> planner withheld, designer contributed without model
    const resUnbound = loadAndStageGeneration({
      pluginFsPath: pluginDir,
      baseStorageFsPath: storageDir,
      rootIdentity: 'file:///work/proj',
      instanceUuid: '11111111-2222-4333-8444-555555555555',
      generationId: 1,
      currentUsage: { activeInstanceGenerations: 0, activeInstanceBytes: 0, persistentAuthorityBytes: 0 },
      rootBindings: null,
      userBindings: null,
      catalog
    });
    assert.equal(resUnbound.contributedCount, 1);
    assert.equal(resUnbound.withheldReasons['evc-planner'], 'TIER_UNBOUND');
    assert.ok(resUnbound.staged?.publishedActorFiles['evc-ui-ux-designer']);
    assert.equal(resUnbound.staged?.publishedActorFiles['evc-planner'], undefined);

    const designerContent = readFileSync(resUnbound.staged.publishedActorFiles['evc-ui-ux-designer'], 'utf8');
    assert.ok(!designerContent.includes('model:'));

    // 2. Bound opus tier -> planner contributed with model frontmatter
    const userBindings = {
      schema: 'evcrate-vscode-bindings-v1',
      revision: 1,
      tiers: { opus: { vendor: 'copilot', id: 'claude-3-opus' } },
      actors: {}
    };
    const resBound = loadAndStageGeneration({
      pluginFsPath: pluginDir,
      baseStorageFsPath: storageDir,
      rootIdentity: 'file:///work/proj',
      instanceUuid: '11111111-2222-4333-8444-555555555555',
      generationId: 2,
      currentUsage: { activeInstanceGenerations: 1, activeInstanceBytes: 1000, persistentAuthorityBytes: 1000 },
      rootBindings: null,
      userBindings,
      catalog
    });
    assert.equal(resBound.contributedCount, 2);
    const plannerContent = readFileSync(resBound.staged.publishedActorFiles['evc-planner'], 'utf8');
    assert.ok(plannerContent.includes('model: "Claude 3 Opus (copilot)"'));

    // 3. Explicit inherit override -> planner omits model
    const inheritBindings = {
      schema: 'evcrate-vscode-bindings-v1',
      revision: 2,
      tiers: { opus: { vendor: 'copilot', id: 'claude-3-opus' } },
      actors: { 'evc-planner': { kind: 'inherit' } }
    };
    const resInherit = loadAndStageGeneration({
      pluginFsPath: pluginDir,
      baseStorageFsPath: storageDir,
      rootIdentity: 'file:///work/proj',
      instanceUuid: '11111111-2222-4333-8444-555555555555',
      generationId: 3,
      currentUsage: { activeInstanceGenerations: 2, activeInstanceBytes: 2000, persistentAuthorityBytes: 2000 },
      rootBindings: null,
      userBindings: inheritBindings,
      catalog
    });
    assert.equal(resInherit.contributedCount, 2);
    const plannerInheritContent = readFileSync(resInherit.staged.publishedActorFiles['evc-planner'], 'utf8');
    assert.ok(!plannerInheritContent.includes('model:'));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
