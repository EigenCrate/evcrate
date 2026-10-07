import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { parseCommandName } from '../../dist/adapters/resource-naming.js';
import { canonicalCommandNameFor, commandNameFor, semanticIdFor } from '../../.evcrate/targets/pi/files/agent/extensions/evcrate/command-files.js';

// The Pi runtime cannot import src/, so it carries a twin of parseCommandName; this keeps them identical.
const commandsDirectory = join(process.cwd(), '.evcrate/source/.claude/commands');

test('Pi runtime semantic ids match the shared parser for every canonical command', () => {
  const stems = readdirSync(commandsDirectory).filter((file) => file.endsWith('.md')).map((file) => file.slice(0, -3));
  assert.ok(stems.length > 0);
  for (const stem of stems) {
    assert.equal(commandNameFor(`${stem}.md`), stem);
    assert.equal(semanticIdFor(stem), parseCommandName(stem).semanticId, stem);
    assert.equal(canonicalCommandNameFor(`${stem}.md`), parseCommandName(stem).semanticId, stem);
  }
});

test('Pi runtime rejects exactly the names the shared parser rejects', () => {
  const invalid = [
    'plan', 'cmd-code', '', 'evc-cmd-', 'evc-cmd-code-x', 'evc-cmd-code-x-', 'evc-cmd-x-x-code', 'evc-cmd-code-x-x', 'evc-cmd-code--auto',
    'evc-cmd-a-x--b', 'evc-cmd-code\n', ' evc-cmd-code', 'evc-cmd-code_auto', 'evc-cmd-code:auto', 'EVC-CMD-CODE', `evc-cmd-${'a'.repeat(60)}`, 'evc-cmd-code-x-x-auto',
  ];
  for (const name of invalid) {
    assert.throws(() => parseCommandName(name), `${name} must be rejected by the shared parser`);
    assert.equal(semanticIdFor(name), undefined, `${name} must be rejected by the Pi twin`);
  }
});

test('Pi runtime and shared parser agree on explicit valid semantic ids', () => {
  const valid = { 'evc-cmd-code': 'code', 'evc-cmd-code-x-auto': 'code/auto', 'evc-cmd-bootstrap-x-auto': 'bootstrap/auto', 'evc-cmd-cook-x-auto-x-fast': 'cook/auto/fast' };
  for (const [name, semanticId] of Object.entries(valid)) {
    assert.equal(parseCommandName(name).semanticId, semanticId, name);
    assert.equal(semanticIdFor(name), semanticId, name);
  }
});
