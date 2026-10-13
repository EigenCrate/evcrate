import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseFrontmatter,
  serializeFrontmatter,
  mapAgentTools,
  parseYamlScalar,
  formatYamlScalar
} from '../../dist/adapters/vscode/metadata.js';
import { ControlPlaneError } from '../../dist/errors/control-plane-error.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const toolReferencesFixture = JSON.parse(
  readFileSync(join(__dirname, '../fixtures/vscode-local/tool-references.json'), 'utf8')
);

test('metadata: parseYamlScalar parses typed scalars correctly', () => {
  assert.equal(parseYamlScalar('true'), true);
  assert.equal(parseYamlScalar('false'), false);
  assert.equal(parseYamlScalar('null'), null);
  assert.equal(parseYamlScalar('~'), null);
  assert.equal(parseYamlScalar('42'), 42);
  assert.equal(parseYamlScalar('-17'), -17);
  assert.equal(parseYamlScalar('3.14'), 3.14);
  assert.equal(parseYamlScalar('"hello world"'), 'hello world');
  assert.equal(parseYamlScalar("'single quotes'"), 'single quotes');
  assert.deepEqual(parseYamlScalar('[]'), []);
  assert.deepEqual(parseYamlScalar('[a, b, true]'), ['a', 'b', true]);
  assert.equal(parseYamlScalar('plain text'), 'plain text');
});

test('metadata: formatYamlScalar formats typed scalars without quotes for booleans/numbers', () => {
  assert.equal(formatYamlScalar(true), 'true');
  assert.equal(formatYamlScalar(false), 'false');
  assert.equal(formatYamlScalar(42), '42');
  assert.equal(formatYamlScalar([]), '[]');
  assert.equal(formatYamlScalar(['a', 'b']), '[a, b]');
  assert.equal(formatYamlScalar('hello-world'), 'hello-world');
  // Strings needing quotes
  assert.equal(formatYamlScalar('true'), '"true"');
  assert.equal(formatYamlScalar('42'), '"42"');
  assert.equal(formatYamlScalar('has: colon'), '"has: colon"');
});

test('metadata: parseFrontmatter handles valid frontmatter with lists and booleans', () => {
  const input = `---
name: my-agent
description: Test agent
user-invocable: true
disable-model-invocation: false
tools:
  - Read
  - Grep
model: sonnet
---

# Agent Body

Instructions here.
`;

  const parsed = parseFrontmatter(input);
  assert.equal(parsed.fields.name, 'my-agent');
  assert.equal(parsed.fields.description, 'Test agent');
  assert.equal(parsed.fields['user-invocable'], true);
  assert.equal(parsed.fields['disable-model-invocation'], false);
  assert.deepEqual(parsed.fields.tools, ['Read', 'Grep']);
  assert.equal(parsed.fields.model, 'sonnet');
  assert.equal(parsed.body.trim(), '# Agent Body\n\nInstructions here.');
});

test('metadata: parseFrontmatter rejects duplicate keys', () => {
  const input = `---
name: agent-one
name: agent-two
---

Body
`;

  assert.throws(
    () => parseFrontmatter(input),
    (err) => err instanceof ControlPlaneError && err.code === 'VALIDATION_INVALID'
  );
});

test('metadata: parseFrontmatter rejects missing colon lines in header', () => {
  const input = `---
name my-agent
---

Body
`;

  assert.throws(
    () => parseFrontmatter(input),
    (err) => err instanceof ControlPlaneError && err.code === 'VALIDATION_INVALID'
  );
});

test('metadata: serializeFrontmatter produces valid YAML with unquoted booleans and clean body', () => {
  const fields = {
    name: 'test-agent',
    description: 'A test agent',
    'user-invocable': true,
    'disable-model-invocation': false,
    tools: [],
    agents: []
  };

  const output = serializeFrontmatter(fields, '# Body Header\nSome content.');
  assert.match(output, /^---\n/);
  assert.match(output, /\nuser-invocable: true\n/);
  assert.match(output, /\ndisable-model-invocation: false\n/);
  assert.match(output, /\ntools: \[\]\n/);
  assert.match(output, /\nagents: \[\]\n/);
  assert.match(output, /\n---\n\n# Body Header\nSome content\.\n$/);
});

test('metadata: mapAgentTools handles missing/undefined tools (intentional inheritance)', () => {
  const resNull = mapAgentTools(null);
  assert.equal(resNull.hasExplicitTools, false);
  assert.equal(resNull.isExplicitNone, false);
  assert.deepEqual(resNull.mapped, []);
  assert.deepEqual(resNull.dropped, []);
  assert.equal(resNull.canDelegate, true);

  const resUndef = mapAgentTools(undefined);
  assert.equal(resUndef.hasExplicitTools, false);
  assert.equal(resUndef.canDelegate, true);
});

test('metadata: mapAgentTools handles explicit "none" as deny-all without delegation', () => {
  const res = mapAgentTools('none');
  assert.equal(res.hasExplicitTools, true);
  assert.equal(res.isExplicitNone, true);
  assert.deepEqual(res.mapped, []);
  assert.deepEqual(res.dropped, []);
  assert.equal(res.canDelegate, false);

  const resEmptyList = mapAgentTools([]);
  assert.equal(resEmptyList.hasExplicitTools, true);
  assert.equal(resEmptyList.isExplicitNone, true);
  assert.deepEqual(resEmptyList.mapped, []);
  assert.equal(resEmptyList.canDelegate, false);
});

test('metadata: mapAgentTools maps canonical tools and restricts delegation when Task is absent', () => {
  // git-manager tools: Glob, Grep, Read, Bash
  const resGit = mapAgentTools('Glob, Grep, Read, Bash');
  assert.equal(resGit.hasExplicitTools, true);
  assert.equal(resGit.isExplicitNone, false);
  assert.deepEqual(
    [...resGit.mapped].sort(),
    ['execute/runInTerminal', 'read/readFile', 'search/fileSearch', 'search/textSearch'].sort()
  );
  assert.deepEqual(resGit.dropped, []);
  assert.equal(resGit.canDelegate, false);
});
test('metadata: mapAgentTools enforces least-privilege separation between terminal runner and helpers', () => {
  const resBash = mapAgentTools('Bash');
  assert.deepEqual([...resBash.mapped], ['execute/runInTerminal']);
  assert.equal(resBash.canDelegate, false);

  const resOutput = mapAgentTools('BashOutput');
  assert.deepEqual([...resOutput.mapped], ['execute/getTerminalOutput']);
  assert.ok(!resOutput.mapped.includes('execute/runInTerminal'), 'BashOutput must not grant execution');

  const resKill = mapAgentTools('KillBash, KillShell');
  assert.deepEqual([...resKill.mapped], ['execute/killTerminal']);
  assert.ok(!resKill.mapped.includes('execute/runInTerminal'), 'Kill helpers must not grant execution');
});


test('metadata: mapAgentTools maps TodoWrite to todo', () => {
  const res = mapAgentTools('Read, TodoWrite');
  assert.deepEqual([...res.mapped].sort(), ['read/readFile', 'todo'].sort());
  assert.deepEqual(res.dropped, []);
});

test('metadata: mapAgentTools allows delegation only when Task is present', () => {
  const resTask = mapAgentTools(['Read', 'Task']);
  assert.deepEqual([...resTask.mapped].sort(), ['agent/runSubagent', 'read/readFile'].sort());
  assert.equal(resTask.canDelegate, true);
});

test('metadata: mapAgentTools records dropped tools faithfully', () => {
  const res = mapAgentTools('Read, Grep, WebSearch, UnknownCustom');
  assert.deepEqual([...res.mapped].sort(), ['read/readFile', 'search/textSearch'].sort());
  assert.deepEqual(
    [...res.dropped].sort(),
    ['UnknownCustom', 'WebSearch'].sort()
  );
  assert.equal(res.canDelegate, false);
});

test('metadata: mapAgentTools maps WebFetch and NotebookEdit to pinned host references', () => {
  const resWebFetch = mapAgentTools('WebFetch');
  assert.deepEqual([...resWebFetch.mapped], ['web/fetch']);
  assert.deepEqual(resWebFetch.dropped, []);

  const resNotebook = mapAgentTools('NotebookEdit');
  assert.deepEqual([...resNotebook.mapped], ['edit/editNotebook']);
  assert.deepEqual(resNotebook.dropped, []);

  // WebSearch remains unsupported/dropped
  const resWebSearch = mapAgentTools('WebSearch');
  assert.deepEqual([...resWebSearch.mapped], []);
  assert.deepEqual(resWebSearch.dropped, ['WebSearch']);

  // Object.prototype keys are treated as unsupported/dropped without throwing
  const resProto = mapAgentTools(['constructor', 'toString', '__proto__', 'Read']);
  assert.deepEqual([...resProto.mapped], ['read/readFile']);
  assert.deepEqual([...resProto.dropped], ['__proto__', 'constructor', 'toString']);
});

test('metadata: capability contract cases match independently recorded host references', () => {
  const { capabilities } = toolReferencesFixture;
  assert.ok(capabilities, 'tool-references fixture must declare capabilities');

  for (const [key, cap] of Object.entries(capabilities)) {
    const res = mapAgentTools(cap.canonical_intent);
    const expectedReferences = cap.host_references || [cap.host_reference];

    assert.deepEqual(
      [...res.mapped].sort(),
      [...expectedReferences].sort(),
      `Capability "${key}" (${cap.canonical_intent}) must map to expected host references`
    );
    assert.deepEqual(
      res.dropped,
      [],
      `Canonical capability "${key}" must not be dropped`
    );

    if (cap.grants_delegation) {
      assert.equal(
        res.canDelegate,
        true,
        `Capability "${key}" must grant delegation eligibility`
      );
    } else {
      assert.equal(
        res.canDelegate,
        false,
        `Capability "${key}" must NOT grant delegation eligibility`
      );
    }
  }
});

test('metadata: security boundary - unsupported-only explicit tools remain empty without fallback to inheritance', () => {
  const resString = mapAgentTools('WebSearch, UnknownCustom');
  assert.equal(resString.hasExplicitTools, true);
  assert.equal(resString.isExplicitNone, false);
  assert.deepEqual(resString.mapped, []);
  assert.deepEqual(
    [...resString.dropped].sort(),
    ['UnknownCustom', 'WebSearch'].sort()
  );
  assert.equal(resString.canDelegate, false);

  const resArray = mapAgentTools(['WebSearch', 'UnknownTool']);
  assert.equal(resArray.hasExplicitTools, true);
  assert.equal(resArray.isExplicitNone, false);
  assert.deepEqual(resArray.mapped, []);
  assert.deepEqual(
    [...resArray.dropped].sort(),
    ['UnknownTool', 'WebSearch'].sort()
  );
  assert.equal(resArray.canDelegate, false);
});

test('metadata: security boundary - deduplication does not duplicate or expand capabilities', () => {
  const resDup = mapAgentTools(['Read', 'read', 'READ', 'Read']);
  assert.deepEqual([...resDup.mapped], ['read/readFile']);
  assert.deepEqual(resDup.dropped, []);
  assert.equal(resDup.canDelegate, false);

  const resTaskDup = mapAgentTools('Task, task, TASK, Read, read');
  assert.deepEqual([...resTaskDup.mapped].sort(), ['agent/runSubagent', 'read/readFile'].sort());
  assert.deepEqual(resTaskDup.dropped, []);
  assert.equal(resTaskDup.canDelegate, true);
});

test('metadata: security boundary - comma-list and array inputs produce identical capability contracts', () => {
  const resArray = mapAgentTools(['Glob', 'Grep', 'Read', 'Task']);
  const resCommaSpaced = mapAgentTools('Glob, Grep, Read, Task');
  const resCommaTight = mapAgentTools('Glob,Grep,Read,Task');

  const expectedMapped = ['agent/runSubagent', 'read/readFile', 'search/fileSearch', 'search/textSearch'].sort();
  assert.deepEqual([...resArray.mapped].sort(), expectedMapped);
  assert.deepEqual([...resCommaSpaced.mapped].sort(), expectedMapped);
  assert.deepEqual([...resCommaTight.mapped].sort(), expectedMapped);
  assert.equal(resArray.canDelegate, true);
  assert.equal(resCommaSpaced.canDelegate, true);
  assert.equal(resCommaTight.canDelegate, true);
});
