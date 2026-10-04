import test from 'node:test';
import assert from 'node:assert/strict';
import {
  replaceCommandPaths,
  renderCommandReferences,
  replaceSkillReferences,
  replaceWorkflowReferences,
  replaceInstructionReferences,
  transformVscodePrompt
} from '../../dist/adapters/vscode/references.js';

const mockCommands = {
  'plan/cro': {
    source: 'plan/cro.md',
    sourceSemanticId: 'plan:cro',
    sourceName: 'plan/cro',
    target: 'skills/cmd-plan-cro/SKILL.md',
    localName: 'cmd-plan-cro',
    targetName: 'cmd-plan-cro',
    nativeInvocationName: '/cmd-plan-cro',
    description: 'CRO plan procedure',
    disposition: 'approximated'
  },
  'ask': {
    source: 'ask.md',
    sourceSemanticId: 'ask',
    sourceName: 'ask',
    target: 'skills/cmd-ask/SKILL.md',
    localName: 'cmd-ask',
    targetName: 'cmd-ask',
    nativeInvocationName: '/cmd-ask',
    description: 'Ask question',
    disposition: 'approximated'
  }
};

const mockSkills = [
  {
    source: 'document-skills/docx',
    sourceSemanticId: 'document-skills:docx',
    target: 'skills/docx',
    localName: 'docx',
    targetName: 'docx',
    nativeInvocationName: '/docx',
    markerSourcePath: 'skills/document-skills/docx/SKILL.md',
    markerTargetPath: 'skills/docx/SKILL.md',
    files: ['SKILL.md', 'spec.md'],
    disposition: 'native'
  },
  {
    source: 'snyk-fix',
    sourceSemanticId: 'snyk-fix',
    target: 'skills/snyk-fix',
    localName: 'snyk-fix',
    targetName: 'snyk-fix',
    nativeInvocationName: '/snyk-fix',
    markerSourcePath: 'skills/snyk-fix/SKILL.md',
    markerTargetPath: 'skills/snyk-fix/SKILL.md',
    files: ['SKILL.md'],
    disposition: 'native'
  }
];

test('references: external URIs are preserved while code fences transform internal paths', () => {
  const input = `Visit https://example.com/plan/cro for details.
\`\`\`bash
# Script command:
cat ~/.claude/commands/plan/cro.md
\`\`\`
Or email test@example.com for /ask.
`;

  const transformed = transformVscodePrompt(input, mockCommands, mockSkills);
  assert.match(transformed, /https:\/\/example\.com\/plan\/cro/);
  assert.match(transformed, /test@example\.com/);
  // Code fence transformed to native target path
  assert.match(transformed, /cat ~\/\.evcrate-vscode\/skills\/cmd-plan-cro\/SKILL\.md/);
});

test('references: replaceCommandPaths rewrites command file paths', () => {
  const input = 'Read ${HOME}/.claude/commands/plan/cro.md or ~/.claude/commands/ask.md';
  const output = replaceCommandPaths(input, mockCommands);
  assert.equal(
    output,
    'Read ${HOME}/.evcrate-vscode/skills/cmd-plan-cro/SKILL.md or ~/.evcrate-vscode/skills/cmd-ask/SKILL.md'
  );
});

test('references: renderCommandReferences replaces slash command invocations', () => {
  const input = 'Run /plan:cro or /plan/cro or /ask to proceed.';
  const output = renderCommandReferences(input, mockCommands);
  assert.equal(output, 'Run /cmd-plan-cro or /cmd-plan-cro or /cmd-ask to proceed.');
});

test('references: replaceSkillReferences rewrites skill paths and document-skills relative links', () => {
  const input = `See .claude/skills/snyk-fix and .claude/skills/document-skills/docx for details.
Reference [spec](../document-skills/docx/spec.md).`;
  const output = replaceSkillReferences(input, mockSkills);
  assert.match(output, /\.evcrate-vscode\/skills\/snyk-fix/);
  assert.match(output, /\.evcrate-vscode\/skills\/docx/);
  assert.match(output, /\[spec\]\(\.\.\/docx\/spec\.md\)/);
});

test('references: replaceWorkflowReferences rewrites workflow paths', () => {
  const input = 'Follow .claude/workflows/primary-workflow.md or ~/.claude/workflows/development-rules.md';
  const output = replaceWorkflowReferences(input);
  assert.equal(
    output,
    'Follow .evcrate-vscode/evcrate/workflows/primary-workflow.md or ~/.evcrate-vscode/evcrate/workflows/development-rules.md'
  );
});

test('references: replaceInstructionReferences rewrites CLAUDE.md to bootstrap rule', () => {
  const input = 'Read .evcrate/source/CLAUDE.md or ~/.evcrate/source/CLAUDE.md for rules';
  const output = replaceInstructionReferences(input);
  assert.equal(
    output,
    'Read .evcrate-vscode/com.github.copilot/rules/bootstrap.instructions.md or ~/.evcrate-vscode/com.github.copilot/rules/bootstrap.instructions.md for rules'
  );
});
