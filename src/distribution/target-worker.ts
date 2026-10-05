import { basename, join, relative } from 'node:path';
import { existsSync, lstatSync, readdirSync } from 'node:fs';
import { vscodeAdapter } from '../adapters/vscode/index.js';
import { createProjectionBuildContext } from '../adapters/types.js';
import { getProjectionAdapter } from '../adapters/index.js';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { createStagedRoot, type StagedRoot } from '../filesystem/atomic.js';
import { hashFile } from '../filesystem/hashing.js';
import {
  loadSelectedManifests,
  loadTargetManifestRegistry,
  manifestAdapterHashes,
  manifestSourceHashes
} from '../manifests/registry.js';
import type { TargetManifest } from '../manifests/types.js';
import { normalizeTarget, type PersistedTarget } from '../protocol/validation.js';
import { collectBaselineOwners } from './local-staging-fs.js';

export interface WorkerRequest {
  readonly type: 'BUILD_TARGET';
  readonly target: PersistedTarget;
  readonly workspacePath: string;
  readonly packageRoot: string;
  readonly registryPath: string;
  readonly canonicalHarnessRoot: string;
  readonly sourceRoot: string;
}

export type ParentToWorkerMessage =
  | WorkerRequest
  | { readonly type: 'STAGE_ACCEPTED' }
  | { readonly type: 'ABORT' };

export interface WorkerSuccessMessage {
  readonly type: 'TARGET_SUCCESS';
  readonly target: PersistedTarget;
  readonly stageBasename: string;
  readonly owners: readonly [string, string][];
  readonly adapterHashes: Readonly<Record<string, string>>;
  readonly sourceHashes: Readonly<Record<string, string>>;
  readonly outputHashes: Readonly<Record<string, string>>;
}

export interface WorkerFailureMessage {
  readonly type: 'TARGET_FAILURE';
  readonly target: PersistedTarget;
  readonly errorCode: string;
  readonly message: string;
}

export type WorkerToParentMessage = WorkerSuccessMessage | WorkerFailureMessage;

export function collectOutputHashes(stagePath: string, manifest: TargetManifest): Record<string, string> {
  const hashes: Record<string, string> = {};
  const visit = (fullPath: string): void => {
    if (!existsSync(fullPath)) return;
    const stat = lstatSync(fullPath);
    if (stat.isDirectory()) {
      for (const entry of readdirSync(fullPath)) {
        visit(join(fullPath, entry));
      }
    } else if (stat.isFile()) {
      const rel = relative(stagePath, fullPath).split('\\').join('/');
      hashes[rel] = hashFile(fullPath);
    }
  };

  for (const root of manifest.outputRoots) {
    visit(join(stagePath, root));
  }
  for (const doc of manifest.projectDocs) {
    visit(join(stagePath, doc));
  }
  return hashes;
}

export function executeTargetBuild(request: WorkerRequest): {
  readonly stage: StagedRoot;
  readonly message: WorkerSuccessMessage;
} {
  const registry = loadTargetManifestRegistry(request.registryPath);
  const manifests = loadSelectedManifests(registry, [request.target]);
  if (manifests.length === 0) {
    throw new ControlPlaneError('VALIDATION_INVALID', `Unknown target: ${request.target}`);
  }
  const manifest = manifests[0];
  const targetStage = createStagedRoot(request.workspacePath, `.evcrate-target-${manifest.id}-`);

  try {
    const adapter = manifest.id === 'vscode' ? vscodeAdapter : getProjectionAdapter(manifest.id);
    const buildContext = createProjectionBuildContext(manifest, request.canonicalHarnessRoot, targetStage);
    adapter.build(buildContext);
    const validation = adapter.validate(buildContext);
    if (!validation.valid) {
      throw new ControlPlaneError('VALIDATION_INVALID', `Validation failed for target ${manifest.id}`);
    }

    const owners = new Map<string, string>();
    for (const root of manifest.outputRoots) {
      collectBaselineOwners(targetStage.path, root, owners);
    }
    for (const doc of manifest.projectDocs) {
      collectBaselineOwners(targetStage.path, doc, owners);
    }

    const adapterHashes = manifestAdapterHashes([manifest], request.packageRoot);
    const sourceHashes = manifestSourceHashes([manifest]);
    const outputHashes = collectOutputHashes(targetStage.path, manifest);

    const message: WorkerSuccessMessage = {
      type: 'TARGET_SUCCESS',
      target: normalizeTarget(manifest.id),
      stageBasename: basename(targetStage.path),
      owners: Array.from(owners.entries()),
      adapterHashes,
      sourceHashes,
      outputHashes
    };

    return { stage: targetStage, message };
  } catch (error) {
    try {
      targetStage.cleanup();
    } catch {
      // Best-effort cleanup
    }
    throw error;
  }
}

export function startWorkerListener(): void {
  if (typeof process.send !== 'function') return;

  let activeStage: StagedRoot | null = null;
  let currentTarget: PersistedTarget | null = null;

  const cleanupAndExit = (code: number): void => {
    if (activeStage) {
      try {
        activeStage.cleanup();
      } catch {
        // Best effort
      }
      activeStage = null;
    }
    process.exit(code);
  };

  process.on('disconnect', () => cleanupAndExit(1));
  process.on('SIGTERM', () => cleanupAndExit(1));
  process.on('SIGINT', () => cleanupAndExit(1));

  process.on('message', (raw: unknown) => {
    const msg = raw as ParentToWorkerMessage;
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'BUILD_TARGET') {
      currentTarget = msg.target;
      try {
        const result = executeTargetBuild(msg);
        activeStage = result.stage;
        process.send!(result.message);
      } catch (error) {
        const errorCode = error instanceof ControlPlaneError ? error.code : 'VALIDATION_INVALID';
        const message = error instanceof Error ? error.message : String(error);
        const failureMessage: WorkerFailureMessage = {
          type: 'TARGET_FAILURE',
          target: msg.target,
          errorCode,
          message
        };
        try {
          process.send!(failureMessage);
        } catch {
          // Ignore IPC send failure on crash
        }
        cleanupAndExit(1);
      }
    } else if (msg.type === 'STAGE_ACCEPTED') {
      cleanupAndExit(0);
    } else if (msg.type === 'ABORT') {
      cleanupAndExit(1);
    }
  });
}

// Auto-run if executed as main script or in child process with IPC
const isMainScript = Boolean(
  process.argv[1] &&
  (process.argv[1].endsWith('target-worker.js') ||
   process.argv[1].endsWith('target-worker.ts'))
);

if (isMainScript && typeof process.send === 'function') {
  startWorkerListener();
}
