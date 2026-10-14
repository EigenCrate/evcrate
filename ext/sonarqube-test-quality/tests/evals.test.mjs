import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const catalog = JSON.parse(fs.readFileSync(new URL('../evals/evals.json', import.meta.url), 'utf8'));

test('eval catalog provides identifiable runnable scenarios', () => {
  assert.equal(catalog.skill_name, 'sonarqube-test-quality');
  assert.ok(Array.isArray(catalog.evals) && catalog.evals.length > 0);
  const ids = new Set();
  for (const scenario of catalog.evals) {
    assert.ok(Number.isInteger(scenario.id) && scenario.id > 0);
    assert.ok(!ids.has(scenario.id), `Duplicate scenario ${scenario.id}`);
    ids.add(scenario.id);
    for (const field of ['prompt', 'expected_output']) {
      assert.ok(typeof scenario[field] === 'string' && scenario[field].trim(), `Scenario ${scenario.id}: missing ${field}`);
    }
    assert.ok(Array.isArray(scenario.files));
    assert.ok(scenario.files.every(file => typeof file === 'string' && file.trim()));
    assert.ok(Array.isArray(scenario.assertions) && scenario.assertions.length > 0);
    assert.ok(scenario.assertions.every(assertion => typeof assertion === 'string' && assertion.trim()));
  }
});
