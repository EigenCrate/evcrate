import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertAgentName,
  assertUniqueNames,
  commandNameFromSourcePath,
  copilotSkillName,
  copilotStyleName,
  formatCommandName,
  parseCommandName,
} from '../../dist/adapters/resource-naming.js';

const MAPPED_COMMAND_NAMES = [
  'evc-cmd-advise',
  'evc-cmd-ask',
  'evc-cmd-bootstrap',
  'evc-cmd-bootstrap-x-auto',
  'evc-cmd-bootstrap-x-auto-x-fast',
  'evc-cmd-bootstrap-x-auto-x-parallel',
  'evc-cmd-brainstorm',
  'evc-cmd-code',
  'evc-cmd-code-x-auto',
  'evc-cmd-code-x-no-test',
  'evc-cmd-code-x-parallel',
  'evc-cmd-coding-level',
  'evc-cmd-content-x-cro',
  'evc-cmd-content-x-enhance',
  'evc-cmd-content-x-fast',
  'evc-cmd-content-x-good',
  'evc-cmd-cook',
  'evc-cmd-cook-x-auto',
  'evc-cmd-cook-x-auto-x-fast',
  'evc-cmd-cook-x-auto-x-parallel',
  'evc-cmd-debug',
  'evc-cmd-design-x-3d',
  'evc-cmd-design-x-describe',
  'evc-cmd-design-x-fast',
  'evc-cmd-design-x-good',
  'evc-cmd-design-x-screenshot',
  'evc-cmd-design-x-video',
  'evc-cmd-docs-x-init',
  'evc-cmd-docs-x-summarize',
  'evc-cmd-docs-x-update',
  'evc-cmd-fix',
  'evc-cmd-fix-x-ci',
  'evc-cmd-fix-x-fast',
  'evc-cmd-fix-x-hard',
  'evc-cmd-fix-x-logs',
  'evc-cmd-fix-x-parallel',
  'evc-cmd-fix-x-test',
  'evc-cmd-fix-x-types',
  'evc-cmd-fix-x-ui',
  'evc-cmd-git-x-cm',
  'evc-cmd-git-x-cp',
  'evc-cmd-git-x-merge',
  'evc-cmd-git-x-pr',
  'evc-cmd-help',
  'evc-cmd-journal',
  'evc-cmd-plan',
  'evc-cmd-plan-x-archive',
  'evc-cmd-plan-x-ci',
  'evc-cmd-plan-x-cro',
  'evc-cmd-plan-x-fast',
  'evc-cmd-plan-x-hard',
  'evc-cmd-plan-x-parallel',
  'evc-cmd-plan-x-two',
  'evc-cmd-plan-x-validate',
  'evc-cmd-review-x-codebase',
  'evc-cmd-review-x-codebase-x-parallel',
  'evc-cmd-scout',
  'evc-cmd-scout-x-ext',
  'evc-cmd-skill-x-add',
  'evc-cmd-skill-x-create',
  'evc-cmd-skill-x-fix-logs',
  'evc-cmd-skill-x-optimize',
  'evc-cmd-skill-x-optimize-x-auto',
  'evc-cmd-skill-x-plan',
  'evc-cmd-take',
  'evc-cmd-test',
  'evc-cmd-test-x-ui',
  'evc-cmd-use-mcp',
  'evc-cmd-watzup',
  'evc-cmd-worktree',
];

const validationInvalid = { name: 'ControlPlaneError', code: 'VALIDATION_INVALID' };

test('all 70 mapped command names round-trip through parse/format', () => {
  assert.equal(MAPPED_COMMAND_NAMES.length, 70);
  for (const name of MAPPED_COMMAND_NAMES) {
    const parsed = parseCommandName(name);
    assert.equal(formatCommandName(parsed.segments), name);
    assert.equal(parsed.name, name);
  }
});

test('parse yields segments and the semantic id used by the advisor allowlist', () => {
  assert.deepEqual({ ...parseCommandName('evc-cmd-code-x-no-test') }, {
    name: 'evc-cmd-code-x-no-test', segments: ['code', 'no-test'], semanticId: 'code/no-test',
  });
  assert.equal(parseCommandName('evc-cmd-cook-x-auto-x-fast').semanticId, 'cook/auto/fast');
  assert.equal(parseCommandName('evc-cmd-help').semanticId, 'help');
  assert.equal(parseCommandName('evc-cmd-review-x-codebase-x-parallel').name.length, 36);
});

test('parse rejects malformed command names', () => {
  const sixtyFive = `evc-cmd-${'a'.repeat(57)}`;
  assert.equal(sixtyFive.length, 65);
  assert.equal(`evc-cmd-${'a'.repeat(56)}`.length, 64);
  parseCommandName(`evc-cmd-${'a'.repeat(56)}`);
  for (const bad of [
    'evc-cmd-', 'evc-cmd-Code', 'evc-cmd-code--auto', 'evc-cmd-code_auto', 'evc-cmd-code:auto',
    'evc-cmd-x', 'evc-cmd-code-x-x', 'evc-cmd-code-x-', 'evc-cmd-x-code', 'evc-cmd-a-x-x-b',
    'evc-cmd-code-x', sixtyFive, 'cmd-code', 'evcrate-cmd-code', 'evc-planner',
  ]) {
    assert.throws(() => parseCommandName(bad), validationInvalid, bad);
  }
});

test('format rejects segments that would break reversibility', () => {
  for (const bad of [[], [''], ['x'], ['a', 'x'], ['a-x-b'], ['Code'], ['a_b'], ['a:b']]) {
    assert.throws(() => formatCommandName(bad), validationInvalid, JSON.stringify(bad));
  }
  assert.equal(formatCommandName(['fix-logs']), 'evc-cmd-fix-logs');
  assert.equal(formatCommandName(['skill', 'fix-logs']), 'evc-cmd-skill-x-fix-logs');
});

test('source path must be flat commands/<name>.md', () => {
  assert.equal(commandNameFromSourcePath('commands/evc-cmd-code-x-auto.md').semanticId, 'code/auto');
  for (const bad of ['commands/code/auto.md', 'commands/evc-cmd-code/auto.md', 'commands/evc-cmd-code.txt',
    'agents/evc-cmd-code.md', 'evc-cmd-code.md', 'commands/code.md', 'commands/.md']) {
    assert.throws(() => commandNameFromSourcePath(bad), validationInvalid, bad);
  }
});

test('names colliding case-insensitively are rejected', () => {
  assertUniqueNames(['evc-cmd-a-x-b', 'evc-cmd-a-x-c']);
  assert.throws(() => assertUniqueNames(['evc-cmd-a-x-b', 'EVC-CMD-A-X-B']), validationInvalid);
});

test('agent names require evc- prefix and matching file stem', () => {
  assert.equal(assertAgentName('evc-planner'), 'evc-planner');
  assert.equal(assertAgentName('evc-planner', 'evc-planner'), 'evc-planner');
  for (const bad of ['planner', 'evc-', 'evc--a', 'evc-Planner', 'evc_planner']) {
    assert.throws(() => assertAgentName(bad), validationInvalid, bad);
  }
  assert.throws(() => assertAgentName('evc-planner', 'evc-other'), validationInvalid);
});

test('copilot skill/style names are prefixed kebab and length-bounded', () => {
  assert.equal(copilotSkillName('ai_multimodal'), 'evc-ai-multimodal');
  assert.equal(copilotSkillName('docs-seeker'), 'evc-docs-seeker');
  assert.equal(copilotStyleName('coding-level-5'), 'evc-style-coding-level-5');
  assert.throws(() => copilotSkillName('a'.repeat(61)), validationInvalid);
  assert.throws(() => copilotStyleName('!!!'), validationInvalid);
});

test('64-char limit is inclusive for every generated name kind', () => {
  const cases = [
    [(n) => formatCommandName(['a'.repeat(n)]), 56],
    [(n) => assertAgentName(`evc-${'a'.repeat(n)}`), 60],
    [(n) => copilotSkillName('a'.repeat(n)), 60],
    [(n) => copilotStyleName('a'.repeat(n)), 54],
  ];
  for (const [build, maxBody] of cases) {
    assert.equal(build(maxBody).length, 64);
    assert.throws(() => build(maxBody + 1), validationInvalid);
  }
});
