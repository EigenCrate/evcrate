import { lstatSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import type { InvocationContext } from '../context/invocation-context.js';
import { createPublicationPlan, type PublicationPlan } from '../distribution/publication-plan.js';
import { readOptionalPublicationMarker } from '../distribution/publication-inventory.js';
import { isPlainObject, parseJsonDocument, type JsonValue } from '../protocol/json.js';
import {
  MAX_PUBLICATION_CHANGES, PUBLICATION_BINDING_ORDER, PUBLICATION_CHANGE_ACTIONS,
  type PublishApplyResultPayload, type PublishDryRunResultPayload, type RecoverResultPayload
} from '../protocol/publication-payloads.js';
import { PERSISTED_TARGETS } from '../protocol/validation.js';
import { defaultProcessRunner } from './process-runner.js';
import type { CliRuntime } from './types.js';

export function assertScript(scriptPath: string): void {
  try {
    const stat = lstatSync(scriptPath);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new ControlPlaneError('PATH_UNSAFE');
  } catch (error) {
    if (error instanceof ControlPlaneError) throw error;
    throw new ControlPlaneError('PATH_UNSAFE');
  }
}

export function bridgeTargetArgs(context: InvocationContext): readonly string[] {
  if (context.selectedTargetIds.length === 1) return ['--target', context.selectedTargetIds[0]];
  if (context.selectedTargetIds.length === PERSISTED_TARGETS.length
    && PERSISTED_TARGETS.every((target) => context.selectedTargetIds.includes(target))) return [];
  throw new ControlPlaneError('CAPABILITY_UNSUPPORTED');
}

export function bridgeBindingOrder(context: InvocationContext): readonly string[] {
  const names = new Set<string>(['.evcrate/bin']);
  for (const binding of context.homeBindings) {
    const name = relative(context.homeRoot, binding.homeRoot).replaceAll('\\', '/');
    if (!name || name === '..' || name.startsWith('../') || names.has(name)) {
      throw new ControlPlaneError('PROTOCOL_INVALID');
    }
    names.add(name);
  }
  return PUBLICATION_BINDING_ORDER.filter((binding) => names.has(binding));
}

export async function runAuthority(
  context: InvocationContext,
  runtime: CliRuntime,
  args: readonly string[],
  failure: 'PUBLICATION_FAILED' | 'RECOVERY_FAILED',
  maxStdoutBytes = 16 * 1024
): Promise<string> {
  const scriptPath = join(context.packageRoot, 'distribute.py');
  assertScript(scriptPath);
  const runner = runtime.processRunner ?? defaultProcessRunner;
  try {
    const processResult = await runner.run({
      executable: runtime.pythonExecutable ?? 'python3', args: [scriptPath, ...args],
      cwd: context.packageRoot, env: {
        ...runtime.env, EVCRATE_HOME: context.homeRoot, EVCRATE_STATE_DIR: context.stateRoot
      },
      signal: runtime.publicationOptions?.abortSignal ?? runtime.abortSignal,
      maxInputBytes: 1, maxStdoutBytes, maxStderrBytes: 8 * 1024, maxLines: 256
    });
    if (processResult.termination !== 'completed' || processResult.exitCode !== 0) {
      throw new ControlPlaneError(failure);
    }
    return processResult.stdout;
  } catch (error) {
    if (error instanceof ControlPlaneError) throw error;
    throw new ControlPlaneError(failure);
  }
}

export function readAuthorityMarker(context: InvocationContext): Record<string, unknown> | null {
  try { return readOptionalPublicationMarker(join(context.stateRoot, 'release-marker.json')); }
  catch { throw new ControlPlaneError('RECOVERY_FAILED'); }
}

export interface AuthorityChange {
  readonly root: string;
  readonly path: string;
  readonly action: typeof PUBLICATION_CHANGE_ACTIONS[number];
}

function sortAuthorityChanges(changes: readonly AuthorityChange[]): AuthorityChange[] {
  return [...changes].sort((left, right) => {
    const a = `${left.root}\u0000${left.path}\u0000${left.action}`;
    const b = `${right.root}\u0000${right.path}\u0000${right.action}`;
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

function expectedAuthorityChanges(plan: PublicationPlan): readonly AuthorityChange[] {
  const isShared = (operation: PublicationPlan['bindings'][number]['operations'][number]): boolean =>
    plan.build.selectedManifests.some((manifest) => Object.entries(manifest.homePolicy.bindings).some(([root]) =>
      root === operation.localRoot && manifest.sharedJson?.destination === operation.relativePath));
  return sortAuthorityChanges(plan.bindings.flatMap((binding) => binding.operations.flatMap((operation) => {
    if (operation.action === 'noop' && !isShared(operation)) return [];
    return [{ root: operation.localRoot, path: operation.relativePath, action: operation.action }];
  })));
}

function validateAuthorityDryRun(output: string, expected: readonly AuthorityChange[]): boolean {
  let parsed: JsonValue;
  try { parsed = parseJsonDocument(output, 2 * 1024 * 1024); }
  catch { throw new ControlPlaneError('PUBLICATION_FAILED'); }
  if (!Array.isArray(parsed) || parsed.length > MAX_PUBLICATION_CHANGES) {
    throw new ControlPlaneError('PUBLICATION_FAILED');
  }
  const actual: AuthorityChange[] = [];
  for (const item of parsed) {
    if (!isPlainObject(item) || Object.keys(item).length !== 3
      || typeof item.root !== 'string' || typeof item.path !== 'string' || typeof item.action !== 'string'
      || !PUBLICATION_CHANGE_ACTIONS.includes(item.action as typeof PUBLICATION_CHANGE_ACTIONS[number])) {
      throw new ControlPlaneError('PUBLICATION_FAILED');
    }
    actual.push({ root: item.root, path: item.path, action: item.action as typeof PUBLICATION_CHANGE_ACTIONS[number] });
  }
  const normalized = sortAuthorityChanges(actual);
  if (normalized.length !== expected.length
    || normalized.some((change, index) => {
      const wanted = expected[index];
      return wanted === undefined || change.root !== wanted.root
        || change.path !== wanted.path || change.action !== wanted.action;
    })) throw new ControlPlaneError('PUBLICATION_FAILED');
  return actual.some(({ action }) => action === 'conflict');
}

export async function runAuthorityPublication(
  operation: 'publish.dry-run' | 'publish.apply' | 'recover',
  context: InvocationContext,
  runtime: CliRuntime = {},
  expectedReleaseId: string | null = null
): Promise<PublishDryRunResultPayload | PublishApplyResultPayload | RecoverResultPayload> {
  const targetArgs = bridgeTargetArgs(context);
  if (operation === 'recover') {
    const before = readAuthorityMarker(context);
    const beforeStatus = before?.status;
    if (expectedReleaseId !== null
      && (beforeStatus !== 'in_progress' || before?.release_id !== expectedReleaseId)) {
      throw new ControlPlaneError('RECOVERY_FAILED');
    }
    await runAuthority(context, runtime, ['--recover', ...targetArgs], 'RECOVERY_FAILED');
    if (beforeStatus !== 'in_progress') return { releaseId: null, action: 'none', selectedTargets: [], bindingOrder: [] };
    const after = readAuthorityMarker(context);
    if (after?.status !== 'recovered' || typeof after.release_id !== 'string'
      || after.release_id !== before?.release_id) throw new ControlPlaneError('RECOVERY_FAILED');
    return {
      releaseId: after.release_id, action: 'rolled-back',
      selectedTargets: context.selectedTargetIds, bindingOrder: bridgeBindingOrder(context)
    };
  }
  const dryOutput = await runAuthority(
    context, runtime, ['--publish', '--dry-run', '--json', ...targetArgs], 'PUBLICATION_FAILED', 2 * 1024 * 1024
  );
  const plan = createPublicationPlan(context, join(context.stateRoot, 'release-marker.json'));
  const authorityConflict = validateAuthorityDryRun(dryOutput, expectedAuthorityChanges(plan));
  if (operation === 'publish.dry-run') {
    return {
      buildManifestPath: plan.buildManifestPath, buildManifestDigest: plan.buildManifestDigest,
      selectedTargets: plan.selectedTargets, bindingOrder: plan.bindingOrder, changes: plan.changes
    };
  }
  if (authorityConflict || plan.changes.some(({ action }) => action === 'conflict')) {
    throw new ControlPlaneError('PUBLICATION_FAILED');
  }
  await runAuthority(context, runtime, ['--publish', ...targetArgs], 'PUBLICATION_FAILED');
  const marker = readAuthorityMarker(context);
  if (marker?.status !== 'complete' || typeof marker.release_id !== 'string') {
    throw new ControlPlaneError('PUBLICATION_FAILED');
  }
  const retained = marker.retained_release_id;
  if (retained !== undefined && retained !== null && typeof retained !== 'string') {
    throw new ControlPlaneError('PUBLICATION_FAILED');
  }
  const postDryOutput = await runAuthority(
    context, runtime, ['--publish', '--dry-run', '--json', ...targetArgs], 'PUBLICATION_FAILED', 2 * 1024 * 1024
  );
  const postPlan = createPublicationPlan(context, join(context.stateRoot, 'release-marker.json'));
  validateAuthorityDryRun(postDryOutput, expectedAuthorityChanges(postPlan));
  return {
    releaseId: marker.release_id, buildManifestPath: plan.buildManifestPath,
    buildManifestDigest: plan.buildManifestDigest, selectedTargets: plan.selectedTargets,
    bindingOrder: plan.bindingOrder, changes: plan.changes, retainedReleaseId: retained ?? null
  };
}
