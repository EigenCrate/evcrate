import { ControlPlaneError } from '../../errors/control-plane-error.js';
import type { ProjectionBuildContext } from '../types.js';
import { filesUnder, sourcePath, decodeUtf8, copyText, writeJson } from './common.js';
import { parseFrontmatter, serializeFrontmatter } from './metadata.js';
import { transformVscodePrompt } from './references.js';
import type { VscodeCommandMapEntry, VscodeSkillMapEntry } from './names.js';
import { renderVscodeInlineAdviseCommand } from './advisory.js';

export function convertVscodeCommands(
  context: ProjectionBuildContext,
  commandMap: Record<string, VscodeCommandMapEntry>,
  skills: readonly VscodeSkillMapEntry[]
): void {
  const commandFiles = filesUnder(context, 'commands')
    .filter((file) => file.path.endsWith('.md'))
    .sort((a, b) => a.path.localeCompare(b.path));

  for (const file of commandFiles) {
    const rel = sourcePath('commands', file);
    const stem = rel.slice(0, -3);
    const entry = commandMap[stem];
    if (!entry) {
      throw new ControlPlaneError('VALIDATION_INVALID');
    }

    const parsed = parseFrontmatter(decodeUtf8(file.bytes));
    const description = typeof parsed.fields.description === 'string'
      ? transformVscodePrompt(parsed.fields.description.trim(), commandMap, skills)
      : entry.description;

    const outFrontmatter: Record<string, unknown> = {
      name: entry.localName,
      description: description || `Command procedure for ${stem}`,
      'user-invocable': true,
      'disable-model-invocation': true
    };
    let body = parsed.body;
    if (entry.sourceSemanticId === 'advise') {
      outFrontmatter.description = 'Interview-first technical advice; advisor relay is unsupported by VS Code Local.';
      outFrontmatter['argument-hint'] = '[prompt-or-url]';
      body = renderVscodeInlineAdviseCommand(parsed.body, 'vscode/askQuestions');
    } else if (entry.argumentHint) {
      outFrontmatter['argument-hint'] = entry.argumentHint;
    }

    const transformedBody = transformVscodePrompt(body, commandMap, skills);
    const rendered = serializeFrontmatter(outFrontmatter, transformedBody);
    copyText(context, file.path, entry.target, () => rendered);
  }

  const commandsList = Object.values(commandMap).map((cmd) => ({
    source: cmd.source,
    sourceSemanticId: cmd.sourceSemanticId,
    sourceName: cmd.sourceName,
    target: cmd.target,
    localName: cmd.localName,
    targetName: cmd.targetName,
    nativeInvocationName: cmd.nativeInvocationName,
    description: cmd.description,
    ...(cmd.argumentHint ? { argumentHint: cmd.argumentHint } : {}),
    disposition: cmd.disposition
  }));

  writeJson(context, 'evcrate/command-name-map.json', {
    schema: 'evcrate-vscode-command-name-map-v1',
    plugin_id: 'evcrate-local',
    commands: commandsList
  });
}
