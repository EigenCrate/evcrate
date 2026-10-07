import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseFrontmatter,
  serializeFrontmatter,
  mapAgentTools,
  parseYamlScalar,
  formatYamlScalar,
  VSCODE_LOCAL_TOOL_MAP
} from '../../dist/adapters/vscode/metadata.js';
import { ControlPlaneError } from '../../dist/errors/control-plane-error.js';

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
    ['file_search', 'grep_search', 'read_file', 'run_in_terminal'].sort()
  );
  assert.deepEqual(resGit.dropped, []);
  assert.equal(resGit.canDelegate, false);
});

test('metadata: mapAgentTools maps TodoWrite to manage_todo_list', () => {
  const res = mapAgentTools('Read, TodoWrite');
  assert.deepEqual([...res.mapped].sort(), ['manage_todo_list', 'read_file']);
  assert.deepEqual(res.dropped, []);
});

test('metadata: mapAgentTools allows delegation only when Task is present', () => {
  const resTask = mapAgentTools(['Read', 'Task']);
  assert.deepEqual([...resTask.mapped].sort(), ['read_file', 'runSubagent'].sort());
  assert.equal(resTask.canDelegate, true);
});

test('metadata: mapAgentTools records dropped tools faithfully', () => {
  const res = mapAgentTools('Read, Grep, WebFetch, NotebookEdit, UnknownCustom');
  assert.deepEqual([...res.mapped].sort(), ['grep_search', 'read_file'].sort());
  assert.deepEqual(
    [...res.dropped].sort(),
    ['NotebookEdit', 'UnknownCustom', 'WebFetch'].sort()
  );
  assert.equal(res.canDelegate, false);
});

test('metadata: VSCODE_LOCAL_TOOL_MAP defines all 13 canonical tool mappings', () => {
  assert.equal(VSCODE_LOCAL_TOOL_MAP.read, 'read_file');
  assert.equal(VSCODE_LOCAL_TOOL_MAP.edit, 'edit_file');
  assert.equal(VSCODE_LOCAL_TOOL_MAP.write, 'edit_file');
  assert.equal(VSCODE_LOCAL_TOOL_MAP.multiedit, 'edit_file');
  assert.equal(VSCODE_LOCAL_TOOL_MAP.bash, 'run_in_terminal');
  assert.equal(VSCODE_LOCAL_TOOL_MAP.bashoutput, 'run_in_terminal');
  assert.equal(VSCODE_LOCAL_TOOL_MAP.killbash, 'run_in_terminal');
  assert.equal(VSCODE_LOCAL_TOOL_MAP.killshell, 'run_in_terminal');
  assert.equal(VSCODE_LOCAL_TOOL_MAP.grep, 'grep_search');
  assert.equal(VSCODE_LOCAL_TOOL_MAP.glob, 'file_search');
  assert.equal(VSCODE_LOCAL_TOOL_MAP.ls, 'file_search');
  assert.equal(VSCODE_LOCAL_TOOL_MAP.task, 'runSubagent');
  assert.equal(VSCODE_LOCAL_TOOL_MAP.todowrite, 'manage_todo_list');
});
