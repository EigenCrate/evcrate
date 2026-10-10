import { basename } from 'node:path';
import { ControlPlaneError } from '../../errors/control-plane-error.js';
import { canonicalJsonBytes } from '../../filesystem/hashing.js';
import { parseJsonDocument } from '../../protocol/json.js';
import { copyGraphTree, graphFile, isProductionControllerArtifact, writeProjectionFile } from '../projection-utils.js';
import type { ProjectionBuildContext } from '../types.js';
import { normalizeLf, validateSkillFrontmatter } from './frontmatter.js';
import { parseCommandName } from '../resource-naming.js';
import { renderHarnessScriptReferences, translatePiSkill, translatePrompt } from './transforms.js';
import { renderAdvisoryInterviewWorkflow, renderInlineAdviseCommand, renderMentoringWorkflow } from '../advisory.js';

export interface ResourceInventory {
  readonly commands: readonly string[];
  readonly workflows: readonly string[];
  readonly agents: readonly string[];
  readonly skills: readonly string[];
  readonly scripts: readonly string[];
  readonly hooks: readonly string[];
}

const SKIP_PARTS = new Set(['tests', 'fixtures', 'helpers', '__tests__']);
const canonicalFiles = (context: ProjectionBuildContext, prefix: string): readonly string[] => context.resources.files
  .filter((file) => file.path === prefix || file.path.startsWith(`${prefix}/`)).map((file) => file.path);

function relativeName(path: string, prefix: string): string { return path === prefix ? '' : path.slice(prefix.length + 1); }
function text(context: ProjectionBuildContext, path: string): string { return new TextDecoder('utf-8', { fatal: true }).decode(graphFile(context, path).bytes); }
function isController(path: string): boolean { return path.includes('/bin/lib/advisor/') || path.startsWith('bin/lib/advisor/') || path === 'bin/evcrate-advisor'; }
function transformed(bytes: Uint8Array, transform: (value: string) => string): Uint8Array {
  if (bytes.subarray(0, 1024).includes(0)) return bytes;
  let value: string;
  try { value = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return bytes; }
  return new TextEncoder().encode(transform(value));
}

export function inventory(context: ProjectionBuildContext): ResourceInventory {
  const markdown = (prefix: string): string[] => canonicalFiles(context, prefix).filter((path) => path.endsWith('.md')).map((path) => relativeName(path, prefix).slice(0, -3)).sort();
  const skills = new Set<string>();
  for (const path of canonicalFiles(context, 'skills')) {
    if (basename(path) === 'SKILL.md') skills.add(relativeName(path, 'skills').slice(0, -8));
  }
  return Object.freeze({
    commands: Object.freeze(markdown('commands').map((name) => parseCommandName(name).name)), workflows: Object.freeze(markdown('workflows')),
    agents: Object.freeze(markdown('agents')), skills: Object.freeze([...skills].sort()),
    scripts: Object.freeze(canonicalFiles(context, 'scripts').map((path) => relativeName(path, 'scripts')).filter((path) => !isController(path) && !path.includes('advise-state')).sort()),
    hooks: Object.freeze(canonicalFiles(context, 'hooks').map((path) => relativeName(path, 'hooks')).filter((path) => !path.split('/').some((part) => SKIP_PARTS.has(part))).sort())
  });
}

export function copyAgentsDocument(context: ProjectionBuildContext, resources: ResourceInventory): void {
  const source = text(context, 'AGENTS.md');
  writeProjectionFile(context, '.pi/agent/evcrate/AGENTS.md', new TextEncoder().encode(translatePrompt(normalizeLf(source), resources.commands)));
}



export function copyCommandsAndWorkflows(context: ProjectionBuildContext, resources: ResourceInventory): void {
  for (const path of canonicalFiles(context, 'commands').concat(canonicalFiles(context, 'workflows'))) {
    if (!path.endsWith('.md')) continue;
    const prefix = path.startsWith('commands/') ? 'commands' : 'workflows';
    const destination = `.pi/agent/evcrate/${prefix}/${relativeName(path, prefix)}`;
    const sourceText = normalizeLf(text(context, path));
    let value = translatePrompt(sourceText, resources.commands);
    if (path === 'commands/evc-cmd-advise.md') value = renderInlineAdviseCommand(sourceText, 'pi', 'ask_user_question');
    if (path === 'workflows/advisory-interview.md') value = renderAdvisoryInterviewWorkflow(sourceText, 'pi');
    if (path === 'workflows/advisor-mentoring.md') value = translatePrompt(renderMentoringWorkflow(sourceText, 'pi'), resources.commands);
    writeProjectionFile(context, destination, new TextEncoder().encode(value));
  }
}

export function copySkills(context: ProjectionBuildContext): void {
  const skillFiles = canonicalFiles(context, 'skills');
  const packages = new Set<string>();
  for (const path of skillFiles) if (path.endsWith('/SKILL.md')) {
    validateSkillFrontmatter(text(context, path)); packages.add(path.slice('skills/'.length, -'/SKILL.md'.length));
  }
  for (const path of skillFiles) {
    const name = relativeName(path, 'skills');
    if (name === 'claude-code/skill.md' || ![...packages].some((pkg) => name === pkg || name.startsWith(`${pkg}/`))) continue;
    const file = graphFile(context, path);
    const bytes = transformed(file.bytes, translatePiSkill);
    writeProjectionFile(context, `.pi/agent/skills/${name}`, bytes, file.executable ?? false);
  }
}
export function copyHooksAndScripts(context: ProjectionBuildContext): void {
  for (const path of canonicalFiles(context, 'hooks')) {
    const name = relativeName(path, 'hooks'); if (name.split('/').some((part) => SKIP_PARTS.has(part))) continue;
    const file = graphFile(context, path);
    const bytes = transformed(file.bytes, renderHarnessScriptReferences);
    writeProjectionFile(context, `.pi/agent/evcrate/hooks/${name}`, bytes, file.executable ?? false);
  }
  for (const path of canonicalFiles(context, 'scripts')) {
    const name = relativeName(path, 'scripts'); if (name.includes('advise-state') || isController(name) || isProductionControllerArtifact(name) || name === 'commands_data.yaml' || name === 'skills_data.yaml') continue;
    const file = graphFile(context, path);
    const bytes = transformed(file.bytes, renderHarnessScriptReferences);
    writeProjectionFile(context, `.pi/agent/evcrate/scripts/${name}`, bytes, file.executable ?? false);
  }
  copyGraphTree(context, '.evcrateignore', '.pi/agent/evcrate/.evcrateignore');
  const settings = parseJsonDocument(graphFile(context, 'settings.json').bytes);
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new ControlPlaneError('VALIDATION_INVALID');
  const hooks = (settings as Record<string, unknown>).hooks;
  if (!hooks || typeof hooks !== 'object' || Array.isArray(hooks)) throw new ControlPlaneError('VALIDATION_INVALID');
  const events: Record<string, unknown[]> = {};
  const command = /\.claude\/hooks\/([^"'\s]+)/u;
  for (const event of Object.keys(hooks).sort()) {
    const entries = (hooks as Record<string, unknown>)[event]; if (!Array.isArray(entries)) throw new ControlPlaneError('VALIDATION_INVALID');
    events[event] = entries.map((entry: unknown) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new ControlPlaneError('VALIDATION_INVALID');
      const handlers = (entry as Record<string, unknown>).hooks;
      if (!Array.isArray(handlers)) throw new ControlPlaneError('VALIDATION_INVALID');
      const scripts: string[] = handlers.map((handler: unknown) => {
        const value = handler && typeof handler === 'object' && !Array.isArray(handler) ? (handler as Record<string, unknown>).command : null;
        const match = typeof value === 'string' ? command.exec(value) : null;
        if (!match) throw new ControlPlaneError('VALIDATION_INVALID'); return match[1];
      });
      return { matcher: (entry as Record<string, unknown>).matcher ?? '*', scripts, safetyScripts: scripts.filter((item: string) => ['scout-block.cjs', 'privacy-block.cjs'].includes(basename(item))) };
    });
  }
  writeJson(context, '.pi/agent/evcrate/hook-map.json', { schema: 'evcrate-pi-hook-map-v1', events });
}

export function writeJson(context: ProjectionBuildContext, path: string, value: unknown): void {
  writeProjectionFile(context, path, canonicalJsonBytes(value));
}
