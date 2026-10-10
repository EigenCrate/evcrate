/**
 * Single authority for evc-* command / agent / Copilot skill+style identities.
 *
 * Name grammar (valid in Agent Skills spec, Windows filenames and every harness):
 *   name    = [a-z0-9]+ ('-' [a-z0-9]+)*     (<= 64 chars, no `_`, `:`, `--`)
 *   command = 'evc-cmd-' segment ('-x-' segment)*
 *   agent   = 'evc-' rest
 * `-x-` is the reserved path separator, so no segment may contain a `x` token.
 * Semantic id (`code/auto`) is the segments joined with `/`; it stays the stable
 * key for the advisor activation allowlist.
 */
import { ControlPlaneError } from '../errors/control-plane-error.js';

export const COMMAND_PREFIX = 'evc-cmd-';
export const SEGMENT_SEPARATOR = '-x-';
export const AGENT_PREFIX = 'evc-';
export const COPILOT_STYLE_PREFIX = 'evc-style-';
export const MAX_NAME_LENGTH = 64;

const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const COMMAND_SOURCE_PATH = /^commands\/([^/]+)\.md$/u;

export interface CommandName {
  readonly name: string;
  readonly segments: readonly string[];
  readonly semanticId: string;
}

function invalid(detail: string): never {
  throw new ControlPlaneError('VALIDATION_INVALID', detail);
}

function assertKebab(value: string, label: string): void {
  if (!NAME_PATTERN.test(value) || value.length > MAX_NAME_LENGTH) invalid(`${label} is not a valid kebab-case name`);
}

function assertSegment(segment: string): void {
  if (!NAME_PATTERN.test(segment)) invalid('command segment is not a valid kebab-case token');
  if (segment.split('-').includes('x')) invalid('command segment contains reserved token x');
}

/** Lowercase, collapse separators to `-`, strip edges; shared by Copilot skill/style helpers. */
function kebab(value: string): string {
  const result = value
    .replace(/[_\s]+/gu, '-')
    .replace(/[^A-Za-z0-9-]+/gu, '-')
    .replace(/-+/gu, '-')
    .replace(/^-|-$/gu, '')
    .toLowerCase();
  if (result.length === 0) invalid('name has no usable characters');
  return result;
}

export function parseCommandName(name: string): CommandName {
  assertKebab(name, 'command name');
  if (!name.startsWith(COMMAND_PREFIX)) invalid('command name is missing the evc-cmd- prefix');
  const rest = name.slice(COMMAND_PREFIX.length);
  if (rest.length === 0) invalid('command name has no segments');
  const segments = rest.split(SEGMENT_SEPARATOR);
  for (const segment of segments) {
    if (segment.length === 0) invalid('command name has an empty segment');
    assertSegment(segment);
  }
  return Object.freeze({ name, segments: Object.freeze(segments), semanticId: segments.join('/') });
}

/** Inverse of {@link parseCommandName}; used by the codemod and tests. */
export function formatCommandName(segments: readonly string[]): string {
  if (segments.length === 0) invalid('command needs at least one segment');
  for (const segment of segments) assertSegment(segment);
  const name = `${COMMAND_PREFIX}${segments.join(SEGMENT_SEPARATOR)}`;
  assertKebab(name, 'command name');
  return name;
}

/** Flat source only: `commands/<name>.md`; nested paths are rejected. */
export function commandNameFromSourcePath(sourcePath: string): CommandName {
  const match = COMMAND_SOURCE_PATH.exec(sourcePath);
  if (match === null) invalid('command source must be a flat commands/<name>.md path');
  return parseCommandName(match[1]!);
}

/** Agent names are `evc-<kebab>`; when the source file stem is supplied it must equal the name. */
export function assertAgentName(name: string, sourceStem?: string): string {
  assertKebab(name, 'agent name');
  if (!name.startsWith(AGENT_PREFIX) || name.length === AGENT_PREFIX.length) invalid('agent name is missing the evc- prefix');
  if (sourceStem !== undefined && sourceStem !== name) invalid('agent file stem differs from its name');
  return name;
}

/** Case-insensitive collision check over a resolved set of names. */
export function assertUniqueNames(names: Iterable<string>): void {
  const seen = new Set<string>();
  for (const name of names) {
    const key = name.toLowerCase();
    if (seen.has(key)) invalid('duplicate resource name');
    seen.add(key);
  }
}

export function copilotSkillName(skill: string): string {
  const name = `${AGENT_PREFIX}${kebab(skill)}`;
  assertKebab(name, 'copilot skill name');
  return name;
}

export function copilotStyleName(style: string): string {
  const name = `${COPILOT_STYLE_PREFIX}${kebab(style)}`;
  assertKebab(name, 'copilot style name');
  return name;
}
