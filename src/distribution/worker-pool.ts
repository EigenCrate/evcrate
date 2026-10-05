import { basename, dirname, join, resolve } from 'node:path';
import { existsSync, lstatSync, mkdirSync } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import {
  ControlPlaneError,
  CONTROL_PLANE_ERROR_CODES,
  type ControlPlaneErrorCode
} from '../errors/control-plane-error.js';
import { createStagedRoot, type StagedRoot } from '../filesystem/atomic.js';
import { loadSelectedManifests } from '../manifests/registry.js';
import type { PersistedTarget } from '../protocol/validation.js';
import type { SharedBuildInputs, TargetBuildFacts } from './manifest-view-derivation.js';
import { verifyAndCopyChildStage } from './worker-stage-verification.js';
import type { WorkerRequest, WorkerToParentMessage } from './target-worker.js';

export interface WorkerPoolOptions {
  readonly jobs: number | string;
  readonly packageRoot: string;
  readonly sharedInputs: SharedBuildInputs;
  readonly stagePath: string;
  readonly workerScriptPath?: string | undefined;
}

interface ActiveJob {
  readonly target: PersistedTarget;
  readonly child: ChildProcess;
  readonly jobContainer: StagedRoot;
  status: 'running' | 'accepted' | 'aborted' | 'closed';
  readonly closePromise: Promise<number | null>;
}

export function resolveWorkerScriptPath(packageRoot?: string): string {
  // 1. Next to current compiled module (dist/distribution/target-worker.js)
  try {
    const localJs = join(__dirname, 'target-worker.js');
    if (existsSync(localJs)) return localJs;
  } catch {
    // Ignore
  }

  // 2. Under packageRoot/dist/distribution/target-worker.js
  if (packageRoot) {
    const distJs = join(packageRoot, 'dist', 'distribution', 'target-worker.js');
    if (existsSync(distJs)) return distJs;
  }

  // 3. Fallback to ts file for test runners
  try {
    const localTs = join(__dirname, 'target-worker.ts');
    if (existsSync(localTs)) return localTs;
  } catch {
    // Ignore
  }

  throw new ControlPlaneError(
    'PUBLICATION_FAILED',
    'Cannot locate target-worker script for worker pool'
  );
}

export class TargetWorkerPool {
  private readonly jobs: number;
  private readonly packageRoot: string;
  private readonly sharedInputs: SharedBuildInputs;
  private readonly stagePath: string;
  private readonly workerScriptPath: string;

  constructor(options: WorkerPoolOptions) {
    const parsed = typeof options.jobs === 'number' ? options.jobs : Number.parseInt(String(options.jobs).trim(), 10);
    this.jobs = Math.max(1, Number.isInteger(parsed) ? parsed : 1);
    this.packageRoot = resolve(options.packageRoot);
    this.sharedInputs = options.sharedInputs;
    this.stagePath = resolve(options.stagePath);
    this.workerScriptPath = options.workerScriptPath ?? resolveWorkerScriptPath(this.packageRoot);
  }

  async run(targets: readonly PersistedTarget[]): Promise<TargetBuildFacts[]> {
    if (targets.length === 0) return [];

    const queue: PersistedTarget[] = [...targets];
    const results = new Map<PersistedTarget, TargetBuildFacts>();
    const activeJobs = new Map<PersistedTarget, ActiveJob>();
    let aborted = false;
    let abortPromise: Promise<void> | null = null;
    let poolError: Error | null = null;

    const abortAllActive = (): Promise<void> => {
      if (abortPromise) return abortPromise;
      aborted = true;
      queue.length = 0; // Clear pending queue immediately

      abortPromise = (async () => {
        const closePromises: Promise<void>[] = [];
        for (const job of activeJobs.values()) {
          if (job.status === 'running') {
            job.status = 'aborted';
            try {
              if (job.child.connected) {
                job.child.send({ type: 'ABORT' });
              }
            } catch {
              // Ignore send failure
            }

            const killTimeout = setTimeout(() => {
              try {
                job.child.kill(process.platform === 'win32' ? undefined : 'SIGKILL');
              } catch {
                // Ignore
              }
            }, 1000);

            closePromises.push(
              job.closePromise.then(() => {
                clearTimeout(killTimeout);
                try {
                  job.jobContainer.cleanup();
                } catch {
                  // Best effort
                }
              })
            );
          }
        }
        await Promise.all(closePromises);
      })();

      return abortPromise;
    };

    const onSignal = (signal: string): void => {
      if (!poolError) {
        poolError = new ControlPlaneError('PUBLICATION_FAILED', `Build received ${signal}`);
      }
      void abortAllActive();
    };

    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);

    const executeTargetJob = async (target: PersistedTarget): Promise<void> => {
      if (aborted) return;

      const jobContainer = createStagedRoot(this.packageRoot, '.evcrate-job-');
      const workspacePath = join(jobContainer.path, 'workspace');
      mkdirSync(workspacePath, { recursive: true });

      const child = spawn(process.execPath, [this.workerScriptPath], {
        stdio: ['pipe', 'pipe', 'pipe', 'ipc']
      });

      // Fix 3: Drain stdout and capture bounded stderr to prevent pipe buffer deadlocks
      let stderrBuffer = '';
      child.stderr?.on('data', (chunk) => {
        if (stderrBuffer.length < 65536) {
          stderrBuffer += chunk.toString();
        }
      });
      child.stdout?.resume(); // Drain stdout

      let resolveClose: (code: number | null) => void;
      const closePromise = new Promise<number | null>((res) => {
        resolveClose = res;
      });

      const job: ActiveJob = {
        target,
        child,
        jobContainer,
        status: 'running',
        closePromise
      };
      activeJobs.set(target, job);

      let targetProcessed = false;

      const handleSuccess = (msg: Extract<WorkerToParentMessage, { type: 'TARGET_SUCCESS' }>): void => {
        if (aborted || targetProcessed) return;
        targetProcessed = true;

        try {
          const base = basename(msg.stageBasename);
          if (base !== msg.stageBasename || base === '.' || base === '..') {
            throw new ControlPlaneError('PATH_UNSAFE', `Invalid stageBasename from worker: ${msg.stageBasename}`);
          }

          const manifests = loadSelectedManifests(this.sharedInputs.registry, [target]);
          if (manifests.length === 0) {
            throw new ControlPlaneError('VALIDATION_INVALID', `Unknown target: ${target}`);
          }
          const manifest = manifests[0];
          const childStagePath = join(jobContainer.path, msg.stageBasename);
          const containerDev = Number(lstatSync(jobContainer.path).dev);

          // Fix 4: Bidirectional output verification and staging copy
          verifyAndCopyChildStage(childStagePath, containerDev, manifest, msg.outputHashes, this.stagePath);

          job.status = 'accepted';
          if (child.connected) {
            child.send({ type: 'STAGE_ACCEPTED' });
          }

          const stagedOutputRoots: Record<string, string> = {};
          const stagedOutputs = new Map<string, string>();
          const localOutputs = new Map<string, string>();

          const liveSourceRoot = join(this.packageRoot, '.evcrate', 'source');
          for (const root of manifest.outputRoots) {
            const staged = join(this.stagePath, root);
            const local = join(liveSourceRoot, root);
            stagedOutputRoots[root] = staged;
            stagedOutputs.set(root, staged);
            localOutputs.set(root, local);
          }
          for (const doc of manifest.projectDocs) {
            const staged = join(this.stagePath, doc);
            const local = join(liveSourceRoot, doc);
            stagedOutputRoots[doc] = staged;
            stagedOutputs.set(doc, staged);
            localOutputs.set(doc, local);
          }

          const facts: TargetBuildFacts = {
            manifest,
            stagedOutputRoots,
            stagedOutputs,
            localOutputs,
            owners: new Map(msg.owners),
            adapterHashes: msg.adapterHashes,
            sourceHashes: msg.sourceHashes
          };
          results.set(target, facts);
        } catch (error) {
          if (!poolError) {
            poolError = error instanceof Error ? error : new Error(String(error));
          }
          void abortAllActive();
        }
      };

      const handleFailure = (msg: Extract<WorkerToParentMessage, { type: 'TARGET_FAILURE' }>): void => {
        if (aborted || targetProcessed) return;
        targetProcessed = true;
        const isKnownCode = (c: string): c is ControlPlaneErrorCode =>
          CONTROL_PLANE_ERROR_CODES.includes(c as ControlPlaneErrorCode);
        const code: ControlPlaneErrorCode = isKnownCode(msg.errorCode) ? msg.errorCode : 'VALIDATION_INVALID';
        if (!poolError) {
          poolError = new ControlPlaneError(code, `Worker failed for target ${target}: ${msg.message}`);
        }
        void abortAllActive();
      };

      child.on('message', (raw: unknown) => {
        const msg = raw as WorkerToParentMessage;
        if (!msg || typeof msg !== 'object') return;
        if (msg.type === 'TARGET_SUCCESS') {
          handleSuccess(msg);
        } else if (msg.type === 'TARGET_FAILURE') {
          handleFailure(msg);
        }
      });

      // Fix 2: Guard child.on('error') against recursive abort ping-pong
      child.on('error', (err) => {
        if (aborted) return;
        if (!poolError) {
          poolError = new ControlPlaneError(
            'PUBLICATION_FAILED',
            `Worker spawn error for ${target}: ${err.message}`
          );
        }
        void abortAllActive();
      });

      child.on('close', (code) => {
        job.status = 'closed';
        resolveClose!(code);
        activeJobs.delete(target);

        try {
          job.jobContainer.cleanup();
        } catch {
          // Best effort
        }

        if (code !== 0 && !targetProcessed && !aborted) {
          const errContext = stderrBuffer.trim() ? `: ${stderrBuffer.trim()}` : '';
          if (!poolError) {
            poolError = new ControlPlaneError(
              'PUBLICATION_FAILED',
              `Worker for target ${target} exited with status ${code}${errContext}`
            );
          }
          void abortAllActive();
        }
      });

      // Send build request to worker
      const request: WorkerRequest = {
        type: 'BUILD_TARGET',
        target,
        workspacePath,
        packageRoot: this.packageRoot,
        registryPath: this.sharedInputs.registryPath,
        canonicalHarnessRoot: this.sharedInputs.canonicalHarnessRoot,
        sourceRoot: this.sharedInputs.sourceRoot
      };
      child.send(request);

      // Await process close before worker slot proceeds to next target
      await closePromise;
    };

    try {
      // Fix 1: Strictly bounded worker slots.
      // Each slot awaits executeTargetJob before shifting the next target from the queue.
      // In-flight active jobs are mathematically capped to min(this.jobs, targets.length).
      const concurrency = Math.min(this.jobs, targets.length);
      const workers: Promise<void>[] = [];

      const runWorkerSlot = async (): Promise<void> => {
        while (!aborted && queue.length > 0) {
          const target = queue.shift()!;
          await executeTargetJob(target);
        }
      };

      for (let i = 0; i < concurrency; i++) {
        workers.push(runWorkerSlot());
      }

      await Promise.all(workers);

      if (abortPromise) {
        await abortPromise;
      }

      if (poolError) {
        throw poolError;
      }

      // Return results ordered according to original targets array
      return targets.map((t) => {
        const fact = results.get(t);
        if (!fact) {
          throw new ControlPlaneError(
            'PUBLICATION_FAILED',
            `Missing build facts for target ${t}`
          );
        }
        return fact;
      });
    } finally {
      process.removeListener('SIGINT', onSignal);
      process.removeListener('SIGTERM', onSignal);
      for (const job of activeJobs.values()) {
        try {
          job.jobContainer.cleanup();
        } catch {
          // Best effort
        }
      }
    }
  }
}
