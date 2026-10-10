import { existsSync, lstatSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type {
  LegacyLeftoverKind, LegacyLeftoverRecord, PublicationScope, PublicationStateTarget, PublicationTarget
} from '../protocol/publication-payloads.js';
import type { PriorManagedOwnership } from './publication-plan.js';
import { normalizeRelativePath } from '../filesystem/paths.js';

export interface LegacyLeftoverScanOptions {
  readonly scope: PublicationScope;
  readonly selectedTargets: readonly PublicationStateTarget[];
  readonly destinationRoot: string;
  readonly currentOwnership: PriorManagedOwnership;
  readonly previousOwnership?: PriorManagedOwnership;
  readonly projectRoot?: string;
}

// 70 canonical commands and their legacy identifiers
const LEGACY_COMMAND_PATHS: readonly string[] = Object.freeze([
  'advise.md',
  'ask.md',
  'bootstrap.md',
  'bootstrap/auto.md',
  'bootstrap/auto/fast.md',
  'bootstrap/auto/parallel.md',
  'brainstorm.md',
  'code.md',
  'code/auto.md',
  'code/no-test.md',
  'code/parallel.md',
  'coding-level.md',
  'content/cro.md',
  'content/enhance.md',
  'content/fast.md',
  'content/good.md',
  'cook.md',
  'cook/auto.md',
  'cook/auto/fast.md',
  'cook/auto/parallel.md',
  'debug.md',
  'design/3d.md',
  'design/describe.md',
  'design/fast.md',
  'design/good.md',
  'design/screenshot.md',
  'design/video.md',
  'docs/init.md',
  'docs/summarize.md',
  'docs/update.md',
  'evcrate-help.md',
  'fix.md',
  'fix/ci.md',
  'fix/fast.md',
  'fix/hard.md',
  'fix/logs.md',
  'fix/parallel.md',
  'fix/test.md',
  'fix/types.md',
  'fix/ui.md',
  'git/cm.md',
  'git/cp.md',
  'git/merge.md',
  'git/pr.md',
  'journal.md',
  'plan.md',
  'plan/archive.md',
  'plan/ci.md',
  'plan/cro.md',
  'plan/fast.md',
  'plan/hard.md',
  'plan/parallel.md',
  'plan/two.md',
  'plan/validate.md',
  'review/codebase.md',
  'review/codebase/parallel.md',
  'scout.md',
  'scout/ext.md',
  'skill/add.md',
  'skill/create.md',
  'skill/fix-logs.md',
  'skill/optimize.md',
  'skill/optimize/auto.md',
  'skill/plan.md',
  'take.md',
  'test.md',
  'test/ui.md',
  'use-mcp.md',
  'watzup.md',
  'worktree.md'
]);

// 18 canonical agents and their legacy names
const LEGACY_AGENTS: readonly string[] = Object.freeze([
  'advisor',
  'brainstormer',
  'code-reviewer',
  'copywriter',
  'database-admin',
  'debugger',
  'docs-manager',
  'fullstack-developer',
  'git-manager',
  'journal-writer',
  'mcp-manager',
  'planner',
  'project-manager',
  'researcher',
  'scout-external',
  'scout',
  'tester',
  'ui-ux-designer'
]);

// Copilot former skills (prefixed with evcrate-)
const COPILOT_LEGACY_SKILLS: readonly string[] = Object.freeze([
  'advisor-strategy',
  'aesthetic',
  'ai-artist',
  'ai-multimodal',
  'backend-development',
  'better-auth',
  'chrome-devtools',
  'claude-code',
  'code-review',
  'context-engineering',
  'databases',
  'debugging',
  'dependency-upgrade-review',
  'devops',
  'docs-seeker',
  'docx',
  'frontend-design',
  'frontend-development',
  'google-adk-python',
  'mcp-builder',
  'mcp-management',
  'media-processing',
  'mermaidjs-v11',
  'mobile-development',
  'pdf',
  'planning',
  'pptx',
  'problem-solving',
  'repomix',
  'research',
  'sequential-thinking',
  'snyk-fix',
  'svg-icon-generator',
  'template-skill',
  'threejs',
  'ui-styling',
  'ui-ux-pro-max',
  'web-frameworks',
  'web-testing',
  'xlsx'
]);

// Copilot former styles (prefixed with evcrate-style-)
const COPILOT_LEGACY_STYLES: readonly string[] = Object.freeze([
  'coding-level-0-eli5',
  'coding-level-1-junior',
  'coding-level-2-mid',
  'coding-level-3-senior',
  'coding-level-4-lead',
  'coding-level-5-god'
]);

function toOmpCommandName(sourcePath: string): string {
  const stem = sourcePath.slice(0, -3);
  const parts = stem.split('/');
  return `cmd-${parts.join('__')}.md`;
}

function toUnderscoredName(sourcePath: string): string {
  const stem = sourcePath.slice(0, -3);
  return stem.replaceAll('/', '_').replaceAll(':', '_');
}

function toDashedName(sourcePath: string): string {
  const stem = sourcePath.slice(0, -3);
  return stem.replaceAll('/', '-').replaceAll(':', '-');
}

interface TargetInspectionItem {
  readonly relativePath: string;
  readonly kind: LegacyLeftoverKind;
  readonly diskRelativePath?: string;
}

function legacyItemsForTarget(target: PublicationStateTarget, scope: PublicationScope): readonly TargetInspectionItem[] {
  const items: TargetInspectionItem[] = [];

  switch (target) {
    case 'claude': {
      for (const cmd of LEGACY_COMMAND_PATHS) {
        items.push({ relativePath: `commands/${cmd}`, kind: 'command' });
      }
      for (const agent of LEGACY_AGENTS) {
        items.push({ relativePath: `agents/${agent}.md`, kind: 'agent' });
      }
      items.push({ relativePath: 'CLAUDE.md', kind: 'instruction' });
      items.push({ relativePath: 'rules/CLAUDE.md', kind: 'instruction' });
      break;
    }

    case 'omp': {
      const prefix = scope === 'home' ? 'agent/' : '';
      for (const cmd of LEGACY_COMMAND_PATHS) {
        const ompName = toOmpCommandName(cmd);
        items.push({ relativePath: `${prefix}commands/${ompName}`, kind: 'command' });
        if (scope === 'home') {
          // Check bare commands/ in home too
          items.push({ relativePath: `commands/${ompName}`, kind: 'command' });
        } else {
          // Check evcrate/commands in project
          items.push({ relativePath: `evcrate/commands/${ompName}`, kind: 'command' });
        }
      }
      for (const agent of LEGACY_AGENTS) {
        items.push({ relativePath: `${prefix}agents/${agent}.md`, kind: 'agent' });
        if (scope === 'home') {
          items.push({ relativePath: `agents/${agent}.md`, kind: 'agent' });
        } else {
          items.push({ relativePath: `evcrate/agents/${agent}.md`, kind: 'agent' });
        }
      }
      items.push({ relativePath: `${prefix}CLAUDE.md`, kind: 'instruction' });
      items.push({ relativePath: `${prefix}evcrate/CLAUDE.md`, kind: 'instruction' });
      break;
    }

    case 'antigravity': {
      for (const cmd of LEGACY_COMMAND_PATHS) {
        const underscored = toUnderscoredName(cmd);
        items.push({ relativePath: `skills/cmd_${underscored}/SKILL.md`, kind: 'command' });
        items.push({ relativePath: `commands/${cmd.replace(/\.md$/u, '.toml')}`, kind: 'command' });
      }
      for (const agent of LEGACY_AGENTS) {
        items.push({ relativePath: `agents/${agent}.md`, kind: 'agent' });
      }
      items.push({ relativePath: 'GEMINI.md', kind: 'instruction' });
      break;
    }

    case 'copilot': {
      for (const cmd of LEGACY_COMMAND_PATHS) {
        const dashed = toDashedName(cmd);
        items.push({ relativePath: `skills/evcrate-cmd-${dashed}/SKILL.md`, kind: 'command' });
      }
      for (const agent of LEGACY_AGENTS) {
        items.push({ relativePath: `agents/evcrate-${agent}.md`, kind: 'agent' });
      }
      for (const skill of COPILOT_LEGACY_SKILLS) {
        items.push({ relativePath: `skills/evcrate-${skill}/SKILL.md`, kind: 'skill' });
      }
      for (const style of COPILOT_LEGACY_STYLES) {
        items.push({ relativePath: `skills/evcrate-style-${style}/SKILL.md`, kind: 'style' });
        items.push({ relativePath: `styles/evcrate-style-${style}/STYLE.md`, kind: 'style' });
      }
      break;
    }

    case 'vscode': {
      for (const cmd of LEGACY_COMMAND_PATHS) {
        const dashed = toDashedName(cmd);
        items.push({ relativePath: `skills/cmd-${dashed}/SKILL.md`, kind: 'command' });
      }
      for (const agent of LEGACY_AGENTS) {
        items.push({ relativePath: `agents/${agent}.md`, kind: 'agent' });
      }
      break;
    }

    case 'gemini': {
      for (const cmd of LEGACY_COMMAND_PATHS) {
        const underscored = toUnderscoredName(cmd);
        items.push({ relativePath: `skills/cmd_${underscored}/SKILL.md`, kind: 'command' });
      }
      items.push({ relativePath: 'GEMINI.md', kind: 'instruction' });
      break;
    }
  }

  return items;
}

function resolveTargetRootOnDisk(target: PublicationStateTarget, destinationRoot: string, scope: PublicationScope): string {
  switch (target) {
    case 'claude': return join(destinationRoot, '.claude');
    case 'codex': return join(destinationRoot, '.codex');
    case 'antigravity': return scope === 'home' ? join(destinationRoot, '.gemini', 'config') : join(destinationRoot, '.antigravity');
    case 'copilot': return join(destinationRoot, '.copilot');
    case 'omp': return join(destinationRoot, '.omp');
    case 'pi': return join(destinationRoot, '.pi');
    case 'vscode': return join(destinationRoot, '.evcrate-vscode');
    case 'gemini': return join(destinationRoot, '.gemini');
  }
}

const TARGET_ROOT_BINDINGS: Readonly<Record<PublicationStateTarget, readonly string[]>> = Object.freeze({
  claude: Object.freeze(['.claude']),
  codex: Object.freeze(['.codex']),
  antigravity: Object.freeze(['.gemini/config', '.antigravity']),
  copilot: Object.freeze(['.copilot']),
  omp: Object.freeze(['.omp']),
  pi: Object.freeze(['.pi']),
  vscode: Object.freeze(['.evcrate-vscode']),
  gemini: Object.freeze(['.gemini'])
});

function isPathRecorded(
  ownership: PriorManagedOwnership | undefined,
  target: string,
  path: string,
  bindings?: readonly string[]
): boolean {
  if (!ownership) return false;
  const targetBindings = ownership[target];
  if (!targetBindings) return false;
  if (bindings !== undefined) {
    return bindings.some((binding) => targetBindings[binding]?.includes(path) === true);
  }
  for (const paths of Object.values(targetBindings)) {
    if (paths.includes(path)) return true;
  }
  return false;
}

/**
 * Checks whether a destination is a migrated resource destination (command, agent,
 * Copilot skill/style, or canonical instruction doc) that must refuse unmanaged collisions.
 */
export function isMigratedDestination(target: PublicationTarget, binding: string, relativePath: string): boolean {
  const norm = normalizeRelativePath(relativePath);
  const segments = norm.split('/');
  const base = segments[segments.length - 1] ?? '';

  // Commands: either flat file starting with evc-cmd- or skill directory starting with evc-cmd-
  if (base.startsWith('evc-cmd-') || segments.some((s) => s.startsWith('evc-cmd-'))) return true;

  // Agents: either flat file starting with evc- or agent directory starting with evc-
  if (base.startsWith('evc-') && (norm.includes('agents/') || norm.startsWith('agents/'))) return true;
  if (segments.some((s) => s.startsWith('evc-') && norm.includes('agents'))) return true;

  // Copilot renamed skills and styles
  if (target === 'copilot') {
    if (norm.startsWith('skills/evc-') || norm.startsWith('styles/evc-style-') || segments.some((s) => s.startsWith('evc-style-'))) return true;
  }

  // VS Code renamed skills
  if (target === 'vscode') {
    if (norm.startsWith('skills/evc-cmd-') || norm.startsWith('agents/evc-')) return true;
  }

  // Canonical instruction documents across all targets
  if (base === 'AGENTS.md') return true;
  if (norm === '.github/copilot-instructions.md' || base === 'copilot-instructions.md') return true;
  if (norm === '.agents/rules/evcrate-antigravity.md' || base === 'evcrate-antigravity.md') return true;
  if (norm === '.agents/hooks.json' || base === 'hooks.json') return true;

  return false;
}

/**
 * Performs a bounded read-only scan of selected targets' known resource locations
 * and detects unmanaged legacy artifacts, subtracting current and prior recorded ownership.
 */
export function detectLegacyLeftovers(options: LegacyLeftoverScanOptions): readonly LegacyLeftoverRecord[] {
  const leftovers: LegacyLeftoverRecord[] = [];
  const seen = new Set<string>();

  for (const target of options.selectedTargets) {
    const targetRoot = resolveTargetRootOnDisk(target, options.destinationRoot, options.scope);
    const rootBindings = target === 'antigravity' && options.scope === 'project'
      ? ['.antigravity']
      : TARGET_ROOT_BINDINGS[target];
    const candidateItems = legacyItemsForTarget(target, options.scope);

    // Check target-relative items inside the target root directory
    if (existsSync(targetRoot)) {
      for (const item of candidateItems) {
        const fullPath = join(targetRoot, item.relativePath);
        if (!existsSync(fullPath)) continue;

        try {
          const stat = lstatSync(fullPath);
          if (stat.isDirectory()) continue;
        } catch {
          continue;
        }

        // Path is target-relative
        const targetRelPath = normalizeRelativePath(item.relativePath);
        const dedupeKey = `${target}:${targetRelPath}`;
        if (seen.has(dedupeKey)) continue;

        // Check if recorded as managed in current or previous ownership
        if (isPathRecorded(options.currentOwnership, target, targetRelPath, rootBindings)) continue;
        if (isPathRecorded(options.previousOwnership, target, targetRelPath, rootBindings)) continue;

        seen.add(dedupeKey);
        leftovers.push(Object.freeze({
          target,
          path: targetRelPath,
          kind: item.kind
        }));
      }
    }

    // Also check Codex skills root: .agents/skills (in both HOME and project scope)
    if (target === 'codex') {
      const skillsRoot = join(options.destinationRoot, '.agents', 'skills');
      if (existsSync(skillsRoot)) {
        for (const cmd of LEGACY_COMMAND_PATHS) {
          const underscored = toUnderscoredName(cmd);
          const skillFile = join(skillsRoot, `cmd_${underscored}`, 'SKILL.md');
          if (existsSync(skillFile)) {
            const relPath = normalizeRelativePath(`cmd_${underscored}/SKILL.md`);
            const dedupeKey = `codex:${relPath}`;
            if (!seen.has(dedupeKey)
              && !isPathRecorded(options.currentOwnership, 'codex', relPath, ['.agents/skills'])
              && !isPathRecorded(options.previousOwnership, 'codex', relPath, ['.agents/skills'])
              && !isPathRecorded(options.previousOwnership, 'codex', `skills/${relPath}`, ['.agents'])) {
              seen.add(dedupeKey);
              leftovers.push(Object.freeze({
                target: 'codex',
                path: relPath,
                kind: 'command'
              }));
            }
          }
        }
      }
    }

    // Also check Antigravity predecessor root: .gemini in both HOME and project scopes
    if (target === 'antigravity') {
      const geminiRoot = join(options.destinationRoot, '.gemini');
      if (existsSync(geminiRoot)) {
        for (const item of candidateItems) {
          const fullPath = join(geminiRoot, item.relativePath);
          if (!existsSync(fullPath)) continue;
          try {
            const stat = lstatSync(fullPath);
            if (stat.isDirectory()) continue;
          } catch {
            continue;
          }
          const targetRelPath = normalizeRelativePath(item.relativePath);
          const dedupeKey = `antigravity:${targetRelPath}`;
          if (seen.has(dedupeKey)) continue;
          if (isPathRecorded(options.currentOwnership, 'antigravity', targetRelPath, ['.gemini'])) continue;
          if (isPathRecorded(options.previousOwnership, 'antigravity', targetRelPath, ['.gemini'])) continue;
          if (isPathRecorded(options.previousOwnership, 'gemini', targetRelPath, ['.gemini'])) continue;
          seen.add(dedupeKey);
          leftovers.push(Object.freeze({
            target: 'antigravity',
            path: targetRelPath,
            kind: item.kind
          }));
        }
      }
    }
    // In project scope: check root-level legacy docs (CLAUDE.md, GEMINI.md)
    if (options.scope === 'project') {
      if (target === 'claude') {
        const projectClaude = join(options.destinationRoot, 'CLAUDE.md');
        if (existsSync(projectClaude)) {
          const dedupeKey = 'claude:CLAUDE.md';
          if (!seen.has(dedupeKey)
            && !isPathRecorded(options.currentOwnership, 'claude', 'CLAUDE.md', ['CLAUDE.md'])
            && !isPathRecorded(options.previousOwnership, 'claude', 'CLAUDE.md', ['CLAUDE.md'])) {
            try {
              if (!lstatSync(projectClaude).isDirectory()) {
                seen.add(dedupeKey);
                leftovers.push(Object.freeze({
                  target: 'claude',
                  path: 'CLAUDE.md',
                  kind: 'instruction'
                }));
              }
            } catch { /* ignore */ }
          }
        }
      }

      if (target === 'antigravity' || target === 'gemini') {
        const projectGemini = join(options.destinationRoot, 'GEMINI.md');
        if (existsSync(projectGemini)) {
          const dedupeKey = `${target}:GEMINI.md`;
          if (!seen.has(dedupeKey)
            && !isPathRecorded(options.currentOwnership, target, 'GEMINI.md', ['GEMINI.md'])
            && !isPathRecorded(options.previousOwnership, target, 'GEMINI.md', ['GEMINI.md'])
            && !isPathRecorded(options.previousOwnership, 'gemini', 'GEMINI.md', ['GEMINI.md'])) {
            try {
              if (!lstatSync(projectGemini).isDirectory()) {
                seen.add(dedupeKey);
                leftovers.push(Object.freeze({
                  target,
                  path: 'GEMINI.md',
                  kind: 'instruction'
                }));
              }
            } catch { /* ignore */ }
          }
        }
      }
    }
  }

  // Deterministic sorting: target, then path, then kind
  // Deterministic sorting matching wire validator: Unicode code point order
  leftovers.sort((left, right) => {
    const keyA = `${left.target}\0${left.path}\0${left.kind}`;
    const keyB = `${right.target}\0${right.path}\0${right.kind}`;
    return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
  });

  return Object.freeze(leftovers);
}
