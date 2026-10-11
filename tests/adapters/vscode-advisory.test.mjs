import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  renderVscodeAdvisoryCapabilities,
  renderVscodeInlineAdviseCommand,
  renderVscodeAdvisoryInterviewWorkflow,
} from '../../dist/adapters/vscode/index.js';
import { parseFrontmatter } from '../../dist/adapters/vscode/metadata.js';

const capability = '<!-- EVCRATE_ADVISORY_CAPABILITIES_START -->\n<!-- EVCRATE_CAPABILITY: advise-inline/v1 -->\n<!-- EVCRATE_ADVISORY_CAPABILITIES_END -->';

test('inline renderer preserves canonical body and frontmatter while translating user input syntax', () => {
  const canonical = `---\ndescription: Advice\nargument-hint: '[prompt-or-url]'\n---\n${capability}\n\nAskUserQuestion for $ARGUMENTS; do not rewrite https://example.test/AskUserQuestion.\n`;
  // A literal tool token is adapter syntax; canonical resource semantics stay unchanged.
  const rendered = renderVscodeInlineAdviseCommand(canonical);
  assert.equal(rendered, canonical.replace('AskUserQuestion for', 'vscode/askQuestions for'));
  assert.deepEqual(parseFrontmatter(rendered).fields, parseFrontmatter(canonical).fields);
  assert.equal(renderVscodeAdvisoryCapabilities(`${capability}\nbody`), `${capability}\nbody`);
});

test('workflow rendering retains canonical inline/report semantics without replacing the interview', () => {
  const canonical = readFileSync(new URL('../../.evcrate/source/.claude/workflows/advisory-interview.md', import.meta.url), 'utf8');
  assert.equal(renderVscodeAdvisoryInterviewWorkflow(canonical), canonical.replaceAll('AskUserQuestion', 'vscode/askQuestions'));
  const command = readFileSync(new URL('../../.evcrate/source/.claude/commands/evc-cmd-advise.md', import.meta.url), 'utf8');
  assert.equal(renderVscodeInlineAdviseCommand(command, 'vscode/askQuestions'), command.replaceAll('AskUserQuestion', 'vscode/askQuestions'));
});

test('inline capability admission rejects absent, malformed, duplicated and reordered blocks', () => {
  const invalid = (error) => error?.code === 'VALIDATION_INVALID';
  for (const document of [
    'missing markers',
    capability.replace('advise-inline/v1', 'unknown/v1'),
    `${capability}\n${capability}`,
    '<!-- EVCRATE_ADVISORY_CAPABILITIES_END -->\n<!-- EVCRATE_CAPABILITY: advise-inline/v1 -->\n<!-- EVCRATE_ADVISORY_CAPABILITIES_START -->',
  ]) {
    assert.throws(() => renderVscodeAdvisoryCapabilities(document), invalid);
    assert.throws(() => renderVscodeInlineAdviseCommand(document), invalid);
    assert.throws(() => renderVscodeAdvisoryInterviewWorkflow(document), invalid);
  }
});
