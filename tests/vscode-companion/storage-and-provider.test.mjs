import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  renderAgentTemplate
} from '../../.cache/evcrate/vscode-model-bindings-dist/agent-renderer.js';
import {
  stageAgentGeneration
} from '../../.cache/evcrate/vscode-model-bindings-dist/resource-storage.js';
import {
  CompanionAgentProvider
} from '../../.cache/evcrate/vscode-model-bindings-dist/agent-provider.js';

test('resource-storage: stageAgentGeneration writes atomic generation, enforces budget, and rejects traversal/duplicates', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'evc-storage-test-'));
  try {
    const rendered1 = renderAgentTemplate({
      actorId: 'evc-planner',
      templateContent: '---\nname: evc-planner\n---\nBody text',
      modelSelector: null
    });
    const rendered2 = renderAgentTemplate({
      actorId: 'evc-scout',
      templateContent: '---\nname: evc-scout\n---\nScout body',
      modelSelector: 'Claude Haiku (anthropic)'
    });

    const staged = stageAgentGeneration({
      baseStorageFsPath: tmp,
      rootIdentity: 'file:///work/my-project',
      instanceUuid: '11111111-2222-4333-8444-555555555555',
      generationId: 1,
      renderedAgents: [rendered1, rendered2],
      currentUsage: { activeInstanceGenerations: 0, activeInstanceBytes: 0, persistentAuthorityBytes: 0 }
    });

    assert.equal(existsSync(staged.generationFsPath), true);
    assert.equal(existsSync(staged.publishedActorFiles['evc-planner']), true);
    assert.equal(existsSync(staged.publishedActorFiles['evc-scout']), true);
    assert.equal(typeof staged.templateInventorySha256, 'string');
    assert.equal(staged.templateInventorySha256.length, 64);

    // Traversal actorId rejected
    assert.throws(() => stageAgentGeneration({
      baseStorageFsPath: tmp,
      rootIdentity: 'file:///work/my-project',
      instanceUuid: '11111111-2222-4333-8444-555555555555',
      generationId: 2,
      renderedAgents: [{ actorId: '../../../escape', content: 'escape', byteLength: 6, sha256: 'a'.repeat(64) }],
      currentUsage: { activeInstanceGenerations: 1, activeInstanceBytes: 100, persistentAuthorityBytes: 100 }
    }), { code: 'CONTRACT_INVALID' });

    // Duplicate actorId rejected
    assert.throws(() => stageAgentGeneration({
      baseStorageFsPath: tmp,
      rootIdentity: 'file:///work/my-project',
      instanceUuid: '11111111-2222-4333-8444-555555555555',
      generationId: 2,
      renderedAgents: [rendered1, rendered1],
      currentUsage: { activeInstanceGenerations: 1, activeInstanceBytes: 100, persistentAuthorityBytes: 100 }
    }), { code: 'CONTRACT_INVALID' });

    // Budget exceeded refuses staging without partial writes
    assert.throws(() => stageAgentGeneration({
      baseStorageFsPath: tmp,
      rootIdentity: 'file:///work/my-project',
      instanceUuid: '11111111-2222-4333-8444-555555555555',
      generationId: 3,
      renderedAgents: [rendered1],
      currentUsage: { activeInstanceGenerations: 32, activeInstanceBytes: 1024, persistentAuthorityBytes: 1024 }
    }), { code: 'STORAGE_BUDGET_EXCEEDED' });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('agent-provider: CompanionAgentProvider emits change only on inventory delta and handles cancellation', () => {
  let firedCount = 0;
  const mockEmitter = {
    event: () => ({ dispose: () => {} }),
    fire: () => { firedCount += 1; },
    dispose: () => {}
  };

  const provider = new CompanionAgentProvider(mockEmitter);
  const mockUri1 = { toString: () => 'file:///gen1/evc-planner.agent.md', scheme: 'file', authority: '', path: '/gen1/evc-planner.agent.md', query: '', fragment: '', fsPath: '/gen1/evc-planner.agent.md' };
  const mockUri2 = { toString: () => 'file:///gen1/evc-scout.agent.md', scheme: 'file', authority: '', path: '/gen1/evc-scout.agent.md', query: '', fragment: '', fsPath: '/gen1/evc-scout.agent.md' };

  const resourcesA = [
    { actorId: 'evc-planner', uri: mockUri1, fsPath: '/gen1/evc-planner.agent.md' },
    { actorId: 'evc-scout', uri: mockUri2, fsPath: '/gen1/evc-scout.agent.md' }
  ];

  const changed1 = provider.updateInventory(resourcesA);
  assert.equal(changed1, true);
  assert.equal(firedCount, 1);

  const changed2 = provider.updateInventory(resourcesA);
  assert.equal(changed2, false);
  assert.equal(firedCount, 1);

  const provided = provider.provideCustomAgents({ isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => {} }) });
  assert.equal(provided.length, 2);

  const cancelled = provider.provideCustomAgents({ isCancellationRequested: true, onCancellationRequested: () => ({ dispose: () => {} }) });
  assert.equal(cancelled.length, 0);

  provider.withdrawInventory();
  assert.equal(firedCount, 2);
  assert.equal(provider.provideCustomAgents({ isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => {} }) }).length, 0);

  provider.dispose();
  assert.equal(provider.isDisposed, true);
});
