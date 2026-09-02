import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PUBLICATION_BINDING_ORDER, assertPublicationRules, mapPublicationPath, publishFile
} from '../../dist/index.js';

const bytes = (value) => new TextEncoder().encode(value);
const text = (value) => new TextDecoder().decode(value);
function manifest(name, publicationRules = []) {
  const root = `.${name}`;
  return {
    name, id: name, manifestPath: `/manifests/${name}.json`, adapter: null, adapterSources: [],
    outputRoots: [root], ownedPaths: [], patches: [], projectDocs: [], sourceRoot: `/source/${name}`,
    overlayRoot: null, sharedJson: null,
    homePolicy: {
      bindings: { [root]: root }, preservePaths: {}, promotionOrder: 1,
      rejectUnmanagedCollisions: false, publicationRules
    }
  };
}

test('publication rules are closed, explicit, and preserve the frozen order', () => {
  assert.deepEqual([...PUBLICATION_BINDING_ORDER], [
    '.evcrate/bin', '.gemini', '.agents', '.codex', '.pi', '.gemini/config', '.omp', '.claude', '.copilot'
  ]);
  assert.equal(mapPublicationPath(manifest('omp', ['omp-agent-prefix']), 'agents/a.md'), 'agent/agents/a.md');
  assert.equal(mapPublicationPath(manifest('claude', ['claude-skill-root-exclusion']), 'skills/README.md'), null);
  assert.equal(mapPublicationPath(manifest('claude', ['claude-skill-root-exclusion']), 'skills/kit/SKILL.md'), 'skills/kit/SKILL.md');
  assert.throws(() => assertPublicationRules(manifest('omp', ['codex-home-path-rewrite'])));
  assert.throws(() => assertPublicationRules(manifest('omp', ['unknown'])));
});

test('Codex rewriting is selected by manifest rule, not destination naming', () => {
  const hooks = bytes(JSON.stringify({ hooks: { notify: [{ hooks: [{ command: '"$CODEX_PROJECT_DIR"/.codex/hooks/run.sh' }] }] } }));
  const rewritten = publishFile(manifest('codex', ['codex-home-path-rewrite']), 'hooks.json', hooks, '/home/user/.codex');
  assert.ok(rewritten);
  assert.match(text(rewritten.content), /\/home\/user\/\.codex\/hooks\/run\.sh/u);
  const config = publishFile(manifest('codex', ['codex-home-path-rewrite']), 'config.toml', bytes('command = ".codex/bin/run-mcp-package.sh"\n'), '/home/user/.codex');
  assert.ok(config);
  assert.match(text(config.content), /command = "\/home\/user\/\.codex\/bin\/run-mcp-package\.sh"/u);
  const noRule = publishFile(manifest('codex', []), 'hooks.json', hooks, '/home/user/.codex');
  assert.ok(noRule);
  assert.equal(text(noRule.content), text(hooks));
});
