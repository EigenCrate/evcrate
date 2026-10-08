import test from 'node:test';
import assert from 'node:assert/strict';
import {
  replaceCommandPaths,
  replaceSkillReferences,
  replaceWorkflowReferences,
  replaceInstructionReferences,
  transformVscodePrompt
} from '../../dist/adapters/vscode/references.js';

const mockCommands = {
  'evc-cmd-plan-x-cro': {
    source: 'evc-cmd-plan-x-cro.md',
    sourceSemanticId: 'plan/cro',
    sourceName: 'plan/cro',
    target: 'skills/evc-cmd-plan-x-cro/SKILL.md',
    localName: 'evc-cmd-plan-x-cro',
    targetName: 'evc-cmd-plan-x-cro',
    nativeInvocationName: '/evc-cmd-plan-x-cro',
    description: 'CRO plan procedure',
    disposition: 'approximated'
  },
  'evc-cmd-ask': {
    source: 'evc-cmd-ask.md',
    sourceSemanticId: 'ask',
    sourceName: 'ask',
    target: 'skills/evc-cmd-ask/SKILL.md',
    localName: 'evc-cmd-ask',
    targetName: 'evc-cmd-ask',
    nativeInvocationName: '/evc-cmd-ask',
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
cat ~/.claude/commands/evc-cmd-plan-x-cro.md
\`\`\`
Or email test@example.com for /evc-cmd-ask.
`;

  const transformed = transformVscodePrompt(input, mockCommands, mockSkills);
  assert.match(transformed, /https:\/\/example\.com\/plan\/cro/);
  assert.match(transformed, /test@example\.com/);
  assert.match(transformed, /cat ~\/\.evcrate-vscode\/skills\/evc-cmd-plan-x-cro\/SKILL\.md/);
});

test('references: replaceCommandPaths rewrites command file paths', () => {
  const input = 'Read ${HOME}/.claude/commands/evc-cmd-plan-x-cro.md or ~/.claude/commands/evc-cmd-ask.md';
  const output = replaceCommandPaths(input, mockCommands);
  assert.equal(
    output,
    'Read ${HOME}/.evcrate-vscode/skills/evc-cmd-plan-x-cro/SKILL.md or ~/.evcrate-vscode/skills/evc-cmd-ask/SKILL.md'
  );
});

test('references: prompt transformation does not rewrite command identities or semantic IDs', () => {
  const input = '/evc-cmd-plan-x-cro /evc-cmd-ask /plan/cro /plan:cro /evcrate:plan:cro /ask';
  assert.equal(transformVscodePrompt(input, mockCommands, mockSkills), input);
});

test('references: replaceSkillReferences rewrites skill paths and document-skills relative links', () => {
  const input = `See .claude/skills/snyk-fix and .claude/skills/document-skills/docx for details.
Reference [spec](../document-skills/docx/spec.md).`;
  const output = replaceSkillReferences(input, mockSkills);
  assert.match(output, /\.evcrate-vscode\/skills\/snyk-fix/);
  assert.match(output, /\.evcrate-vscode\/skills\/docx/);
  assert.match(output, /\[spec\]\(\.\.\/docx\/spec\.md\)/);
});

test('references: replaceWorkflowReferences rewrites workflow paths with published install fallback', () => {
  const input = 'Follow .claude/workflows/primary-workflow.md or ~/.claude/workflows/development-rules.md';
  const output = replaceWorkflowReferences(input);
  assert.equal(
    output,
    'Follow .evcrate-vscode/evcrate/workflows/primary-workflow.md if present; otherwise read ~/.evcrate-vscode/evcrate/workflows/primary-workflow.md (the published install) or ~/.evcrate-vscode/evcrate/workflows/development-rules.md'
  );

  // Quoted with ./
  const quotedInput = 'Read `./.claude/workflows/advisor-mentoring.md` for guidance.';
  const quotedOutput = replaceWorkflowReferences(quotedInput);
  assert.equal(
    quotedOutput,
    'Read `./.evcrate-vscode/evcrate/workflows/advisor-mentoring.md` if present; otherwise read `~/.evcrate-vscode/evcrate/workflows/advisor-mentoring.md` (the published install) for guidance.'
  );

  // Legacy docs alias rewrite
  const docsInput = 'Follow `./docs/development-rules.md` file.';
  const docsOutput = replaceWorkflowReferences(docsInput);
  assert.equal(
    docsOutput,
    'Follow `./.evcrate-vscode/evcrate/workflows/development-rules.md` if present; otherwise read `~/.evcrate-vscode/evcrate/workflows/development-rules.md` (the published install) file.'
  );

  // HOME-qualified forms preserve rebase without fallback
  const homeInput = 'Check $HOME/.claude/workflows/advisor-mentoring.md and ${HOME}/.claude/workflows/primary-workflow.md';
  const homeOutput = replaceWorkflowReferences(homeInput);
  assert.equal(
    homeOutput,
    'Check $HOME/.evcrate-vscode/evcrate/workflows/advisor-mentoring.md and ${HOME}/.evcrate-vscode/evcrate/workflows/primary-workflow.md'
  );

  // Markdown link destination
  const linkInput = 'Follow [rules](./.claude/workflows/development-rules.md) carefully.';
  const linkOutput = replaceWorkflowReferences(linkInput);
  assert.equal(
    linkOutput,
    'Follow [rules](./.evcrate-vscode/evcrate/workflows/development-rules.md) if present; otherwise read ~/.evcrate-vscode/evcrate/workflows/development-rules.md (the published install) carefully.'
  );

  // URI shielding
  const urlInput = 'Visit https://example.com/.claude/workflows/primary-workflow.md for info';
  assert.equal(replaceWorkflowReferences(urlInput), urlInput);
  // Already-projected local and HOME paths
  const projectedLocal = 'See .evcrate-vscode/evcrate/workflows/primary-workflow.md for steps';
  assert.equal(
    replaceWorkflowReferences(projectedLocal),
    'See .evcrate-vscode/evcrate/workflows/primary-workflow.md if present; otherwise read ~/.evcrate-vscode/evcrate/workflows/primary-workflow.md (the published install) for steps'
  );
  const projectedHome = 'See ~/.evcrate-vscode/evcrate/workflows/primary-workflow.md for steps';
  assert.equal(replaceWorkflowReferences(projectedHome), projectedHome);

  // Unquoted docs alias
  const unquotedDocs = 'Consult ./docs/development-rules.md today';
  assert.equal(
    replaceWorkflowReferences(unquotedDocs),
    'Consult ./.evcrate-vscode/evcrate/workflows/development-rules.md if present; otherwise read ~/.evcrate-vscode/evcrate/workflows/development-rules.md (the published install) today'
  );

  // Idempotence
  assert.equal(replaceWorkflowReferences(output), output);
  assert.equal(replaceWorkflowReferences(quotedOutput), quotedOutput);
  assert.equal(replaceWorkflowReferences(docsOutput), docsOutput);
  assert.equal(replaceWorkflowReferences(linkOutput), linkOutput);
  assert.equal(replaceWorkflowReferences(replaceWorkflowReferences(projectedLocal)), replaceWorkflowReferences(projectedLocal));
});

test('references: replaceInstructionReferences rewrites CLAUDE.md to bootstrap rule', () => {
  const input = 'Read .evcrate/source/CLAUDE.md or ~/.evcrate/source/CLAUDE.md for rules';
  const output = replaceInstructionReferences(input);
  assert.equal(
    output,
    'Read .evcrate-vscode/com.github.copilot/rules/bootstrap.instructions.md or ~/.evcrate-vscode/com.github.copilot/rules/bootstrap.instructions.md for rules'
  );
});
