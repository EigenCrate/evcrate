import { ControlPlaneError } from '../../errors/control-plane-error.js';
import type { ProjectionAdapter, ProjectionBuildContext, ProjectionValidation } from '../types.js';
import { ensureProjectionDirectory, validateProjection } from '../projection-utils.js';
import { projectAgents, projectCommands, projectSkills, projectWorkflows } from './resources.js';
import { projectConfig, projectDocumentsAndMatrix, projectHooks, projectScripts, projectSettings } from './runtime.js';

function invalidManifest(): never {
  throw new ControlPlaneError('VALIDATION_INVALID');
}

function assertManifest(context: ProjectionBuildContext): void {
  if (context.manifest.id !== 'gemini' || context.manifest.outputRoots.length !== 1
    || context.manifest.outputRoots[0] !== '.gemini' || context.manifest.sharedJson !== null) invalidManifest();
}

function build(context: ProjectionBuildContext): void {
  assertManifest(context);
  for (const directory of ['.gemini', '.gemini/agents', '.gemini/commands', '.gemini/hooks', '.gemini/scripts', '.gemini/skills', '.gemini/workflows']) {
    ensureProjectionDirectory(context, directory);
  }
  projectConfig(context);
  projectAgents(context);
  projectCommands(context);
  projectSkills(context);
  projectWorkflows(context);
  projectHooks(context);
  projectScripts(context);
  projectDocumentsAndMatrix(context);
  projectSettings(context);
}

export const geminiAdapter: ProjectionAdapter = Object.freeze({
  id: 'gemini',
  compatibility: {
    skill: { status: 'needsAdapter' },
    agent: { status: 'needsAdapter' },
    workflow: { status: 'needsAdapter' },
    command: { status: 'needsAdapter' },
    hook: { status: 'needsAdapter' }
  } as const,
  build,
  validate: (context: ProjectionBuildContext): ProjectionValidation => (assertManifest(context), validateProjection(context)),
});

