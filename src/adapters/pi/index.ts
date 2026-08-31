import { lstatSync } from 'node:fs';
import { normalizeLf } from './frontmatter.js';
import { readBoundedFile } from '../../filesystem/hashing.js';
import { assertNoSymlinkAncestors, containedPath } from '../../filesystem/paths.js';
import { ControlPlaneError } from '../../errors/control-plane-error.js';
import { validateProjection, writeProjectionFile } from '../projection-utils.js';
import type { ProjectionAdapter, ProjectionBuildContext, ProjectionValidation } from '../types.js';
import { convertAgents } from './agents.js';
import { copyCommandsAndWorkflows, copyHooksAndScripts, copySkills, inventory, writeJson } from './resources.js';

const MANAGED_PACKAGES = Object.freeze([
  'npm:pi-subagents@0.44.0',
  'npm:@juicesharp/rpiv-ask-user-question@2.4.0',
  'npm:@juicesharp/rpiv-todo@2.4.0'
]);

function copyNormalized(context: ProjectionBuildContext, source: string, destination: string): void {
  const file = context.resources.files.find((entry) => entry.path === source);
  if (!file) throw new ControlPlaneError('VALIDATION_INVALID');
  let value: string;
  try { value = new TextDecoder('utf-8', { fatal: true }).decode(file.bytes); }
  catch { throw new ControlPlaneError('VALIDATION_INVALID'); }
  writeProjectionFile(context, destination, new TextEncoder().encode(normalizeLf(value)), file.mode);
}

function copyOwnedOverlay(context: ProjectionBuildContext): void {
  const manifest = context.manifest;
  for (const owned of manifest.ownedPaths) {
    if (!owned.startsWith('files/') || !manifest.sourceRoot) throw new ControlPlaneError('PATH_UNSAFE');
    const source = containedPath(manifest.sourceRoot, owned, true);
    assertNoSymlinkAncestors(source);
    let stat;
    try { stat = lstatSync(source); } catch { throw new ControlPlaneError('VALIDATION_INVALID'); }
    if (stat.isSymbolicLink() || !stat.isFile()) throw new ControlPlaneError('PATH_UNSAFE');
    const bytes = readBoundedFile(source, 16 * 1024 * 1024);
    const after = lstatSync(source);
    if (after.isSymbolicLink() || after.dev !== stat.dev || after.ino !== stat.ino || after.size !== stat.size || (after.mode & 0o777) !== (stat.mode & 0o777)) throw new ControlPlaneError('PATH_UNSAFE');
    writeProjectionFile(context, `.pi/${owned.slice('files/'.length)}`, bytes, stat.mode & 0o777);
  }
}
function assertManifest(context: ProjectionBuildContext): void {
  if (context.manifest.id !== 'pi' || context.manifest.outputRoots.length !== 1
    || context.manifest.outputRoots[0] !== '.pi' || context.manifest.sharedJson === null) throw new ControlPlaneError('VALIDATION_INVALID');
  const shared = context.manifest.sharedJson;
  if (shared.schema !== 'pi-settings-v1' || shared.fragment !== 'agent/evcrate/managed-settings.json'
    || shared.destination !== 'agent/settings.json' || shared.managedKeys.length !== 1 || shared.managedKeys[0] !== 'packages') {
    throw new ControlPlaneError('VALIDATION_INVALID');
  }
}
function build(context: ProjectionBuildContext): void {
  assertManifest(context);
  const shared = context.manifest.sharedJson;
  if (shared === null) throw new ControlPlaneError('VALIDATION_INVALID');
  copyNormalized(context, '.evcrate.json', '.pi/.evcrate.json');
  copyNormalized(context, '.evcrateignore', '.pi/.evcrateignore');
  copyOwnedOverlay(context);
  const resources = inventory(context);
  copyCommandsAndWorkflows(context, resources);
  copySkills(context);
  copyHooksAndScripts(context);
  convertAgents(context, resources.commands);
  writeJson(context, `.pi/${shared.fragment}`, { packages: [...MANAGED_PACKAGES], schema: 'evcrate-pi-managed-settings-v1' });
  writeJson(context, '.pi/agent/evcrate/inventory.json', {
    agents: [...resources.agents],
    advisoryCapabilities: { checkpoint: 'supported', inline: 'supported', relay: 'unsupported', relayError: 'ADVISE_AGENT_RELAY_UNSUPPORTED_PI' },
    commands: [...resources.commands], hooks: [...resources.hooks], legacySkillExcluded: 'claude-code/skill.md', scripts: resources.scripts.filter((item) => !item.includes('advise-state')), skills: [...resources.skills], workflows: [...resources.workflows]
  });
}
function validate(context: ProjectionBuildContext): ProjectionValidation {
  assertManifest(context);
  return validateProjection(context);
}

export const piAdapter: ProjectionAdapter = Object.freeze({ id: 'pi', build, validate });
