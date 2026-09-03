import { dirname, join, relative, sep } from 'node:path';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import type { InvocationContext } from '../context/invocation-context.js';
import type { PersistedTarget } from '../protocol/validation.js';
import type { TargetManifest } from '../manifests/types.js';
import { normalizeRelativePath } from '../filesystem/paths.js';
import { hashBytes, hashFile, readBoundedFile, completeTreeHash } from '../filesystem/hashing.js';
import { isPlainObject } from '../protocol/json.js';
import type { PublicationNode, PublicationNodeSnapshot } from './publication-inventory.js';
import type { PublicationChange, PublicationTarget } from '../protocol/publication-payloads.js';
import { MAX_PUBLICATION_CHANGES, PUBLICATION_BINDING_ORDER } from '../protocol/publication-payloads.js';
import { resolveCurrentBuild, type VerifiedCurrentBuild } from './build-resolution.js';
import { assertPublicationRules, mapPublicationPath, publishFile } from './publication-rules.js';
import {
  listPublicationFiles, publicationNode, safePublicationChild, validatePublicationAncestors,
  readOptionalPublicationMarker, controllerTreeHash
} from './publication-inventory.js';
import { planSharedJson, type SharedJsonPlan } from './shared-json.js';
import { validateAdvisorControllerProjection } from '../manifests/controller.js';

export interface PlannedPublicationOperation {
  readonly target: PublicationTarget;
  readonly binding: string;
  readonly localRoot: string;
  readonly relativePath: string;
  readonly destination: string;
  readonly action: PublicationChange['action'];
  readonly beforeHash: string | null;
  readonly beforeSnapshot: PublicationNodeSnapshot;
  readonly intendedHash: string | null;
  readonly content: Uint8Array | null;
}
export interface PublicationBindingPlan {
  readonly target: PublicationTarget;
  readonly localRoot: string;
  readonly binding: string;
  readonly sourceRoot: string;
  readonly destinationRoot: string;
  readonly order: number;
  readonly controller: boolean;
  readonly managedPaths: readonly string[];
  readonly operations: readonly PlannedPublicationOperation[];
}
export interface PublicationPlan {
  readonly build: VerifiedCurrentBuild;
  readonly buildManifestPath: string;
  readonly buildManifestDigest: string;
  readonly selectedTargets: readonly PersistedTarget[];
  readonly bindingOrder: readonly string[];
  readonly bindings: readonly PublicationBindingPlan[];
  readonly changes: readonly PublicationChange[];
}

function fail(code: 'PUBLICATION_FAILED' | 'PATH_UNSAFE' = 'PUBLICATION_FAILED'): never {
  throw new ControlPlaneError(code);
}
function markerPaths(marker: Record<string, unknown> | null, key: string): Set<string> {
  if (!marker || marker.status === 'none') return new Set();
  if (marker.status !== 'complete' && marker.status !== 'recovered') fail();
  const managed = marker.managed_paths;
  if (managed === undefined) return new Set();
  if (!isPlainObject(managed)) fail();
  const values = managed[key] ?? [];
  if (!Array.isArray(values) || !values.every((value) => typeof value === 'string')) fail();
  const result = new Set<string>();
  for (const value of values) {
    const normalized = normalizeRelativePath(value);
    if (result.has(normalized)) fail();
    result.add(normalized);
  }
  return result;
}
function snapshotFor(node: PublicationNode, destination: string, controller = false): PublicationNodeSnapshot {
  if (!node.present) return Object.freeze({ present: false });
  return Object.freeze({
    ...node,
    hash: node.kind === 'directory' ? (controller ? controllerTreeHash(destination) : completeTreeHash(destination)) : node.hash
  });
}
function existing(destination: string): {
  hash: string | null; content: Uint8Array | null; directory: boolean; snapshot: PublicationNodeSnapshot;
} {
  const node = publicationNode(destination);
  const snapshot = snapshotFor(node, destination);
  if (!node.present) return { hash: null, content: null, directory: false, snapshot };
  if (node.kind === 'directory') return { hash: snapshot.hash as string, content: null, directory: true, snapshot };
  const content = readBoundedFile(destination, 16 * 1024 * 1024);
  return { hash: node.hash as string, content, directory: false, snapshot };
}
function actionForFile(
  target: PublicationTarget, binding: string, localRoot: string, relativePath: string,
  destination: string, content: Uint8Array, prior: Set<string>, reject: boolean,
  preserve = false
): PlannedPublicationOperation {
  const current = existing(destination);
  if (preserve) return {
    target, binding, localRoot, relativePath, destination, action: 'preserve',
    beforeHash: current.hash, beforeSnapshot: current.snapshot, intendedHash: current.hash, content: null
  };
  if (current.directory) return {
    target, binding, localRoot, relativePath, destination, action: 'conflict',
    beforeHash: current.hash, beforeSnapshot: current.snapshot, intendedHash: hashBytes(content), content
  };
  if (reject && !prior.has(relativePath) && current.hash !== null) {
    return {
      target, binding, localRoot, relativePath, destination, action: 'conflict',
      beforeHash: current.hash, beforeSnapshot: current.snapshot, intendedHash: hashBytes(content), content
    };
  }
  const intendedHash = hashBytes(content);
  const action = current.hash === null ? 'create' : current.hash === intendedHash ? 'noop' : 'update';
  return {
    target, binding, localRoot, relativePath, destination, action, beforeHash: current.hash,
    beforeSnapshot: current.snapshot, intendedHash, content
  };
}
function sharedOperation(
  manifest: TargetManifest, target: string, localRoot: string, binding: string,
  sourceRoot: string, destinationRoot: string
): PlannedPublicationOperation {
  const spec = manifest.sharedJson;
  if (!spec) fail();
  const fragment = readBoundedFile(safePublicationChild(sourceRoot, spec.fragment), 16 * 1024 * 1024);
  const relativePath = normalizeRelativePath(spec.destination);
  const destination = safePublicationChild(destinationRoot, relativePath);
  const current = existing(destination);
  if (current.directory) return {
    target: target as PublicationTarget, binding, localRoot, relativePath, destination,
    action: 'conflict', beforeHash: current.hash, beforeSnapshot: current.snapshot, intendedHash: null, content: null
  };
  let planned: SharedJsonPlan;
  try { planned = planSharedJson(spec, current.content, fragment); }
  catch (error) { if (error instanceof ControlPlaneError) throw error; fail(); }
  const action = planned.action;
  const content = planned.result;
  return {
    target: target as PublicationTarget, binding, localRoot, relativePath, destination,
    action, beforeHash: current.hash, beforeSnapshot: current.snapshot,
    intendedHash: content === null ? current.hash : hashBytes(content), content
  };
}
function targetBinding(
  manifest: TargetManifest, target: string, localRoot: string, sourceRoot: string,
  destinationRoot: string, binding: string, homeRoot: string, marker: Record<string, unknown> | null
): PublicationBindingPlan {
  assertPublicationRules(manifest);
  validatePublicationAncestors(homeRoot, destinationRoot);
  const prior = markerPaths(marker, localRoot);
  const files = listPublicationFiles(sourceRoot);
  const spec = manifest.sharedJson && localRoot === manifest.outputRoots[0] ? manifest.sharedJson : null;
  const sharedSource = spec ? normalizeRelativePath(spec.fragment) : null;
  const sharedDestination = spec ? normalizeRelativePath(spec.destination) : null;
  const operations: PlannedPublicationOperation[] = [];
  const managed: string[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    if (file.relativePath === sharedDestination) continue;
    const published = publishFile(manifest, file.relativePath, file.content, destinationRoot);
    if (published === null) continue;
    if (seen.has(published.relativePath)) fail();
    seen.add(published.relativePath);
    const preserve = (manifest.homePolicy.preservePaths[localRoot] ?? []).some((value) => mapPublicationPath(manifest, value) === published.relativePath);
    if (!preserve) managed.push(published.relativePath);
    operations.push(actionForFile(target as PublicationTarget, binding, localRoot, published.relativePath,
      safePublicationChild(destinationRoot, published.relativePath), published.content, prior,
      manifest.homePolicy.rejectUnmanagedCollisions, preserve));
  }
  for (const stale of [...prior].sort()) {
    if (seen.has(stale) || managed.includes(stale) || (sharedDestination !== null && stale === sharedDestination)) continue;
    const destination = safePublicationChild(destinationRoot, stale);
    const current = existing(destination);
    if (!current.hash && !current.directory) continue;
    operations.push({
      target: target as PublicationTarget, binding, localRoot, relativePath: stale, destination,
      action: current.directory ? 'conflict' : 'delete', beforeHash: current.hash,
      beforeSnapshot: current.snapshot, intendedHash: null, content: null
    });
  }
  if (spec) operations.push(sharedOperation(manifest, target, localRoot, binding, sourceRoot, destinationRoot));
  return Object.freeze({ target: target as PublicationTarget, localRoot, binding, sourceRoot, destinationRoot,
    order: manifest.homePolicy.promotionOrder, controller: false, managedPaths: Object.freeze([...managed].sort()), operations: Object.freeze(operations) });
}
function controllerBinding(context: InvocationContext, build: VerifiedCurrentBuild): PublicationBindingPlan {
  const sourceRoot = join(build.outputPaths['.evcrate'], 'bin');
  const destinationRoot = join(context.homeRoot, '.evcrate', 'bin');
  validateAdvisorControllerProjection(context.controllerRoot, sourceRoot);
  validatePublicationAncestors(context.homeRoot, destinationRoot);
  const current = publicationNode(destinationRoot);
  if (current.present && current.kind !== 'directory') fail('PATH_UNSAFE');
  const intendedHash = controllerTreeHash(sourceRoot, true);
  const currentSnapshot = snapshotFor(current, destinationRoot, true);
  const beforeHash = currentSnapshot.present ? currentSnapshot.hash as string : null;
  const action = beforeHash === null ? 'create' : beforeHash === intendedHash ? 'noop' : 'update';
  const operation: PlannedPublicationOperation = { target: 'advisor-controller', binding: '.evcrate/bin', localRoot: '.evcrate/bin',
    relativePath: '.evcrate/bin', destination: destinationRoot, action, beforeHash, beforeSnapshot: currentSnapshot, intendedHash, content: null };
  return Object.freeze({ target: 'advisor-controller', localRoot: '.evcrate/bin', binding: '.evcrate/bin', sourceRoot, destinationRoot,
    order: 5, controller: true, managedPaths: Object.freeze([]), operations: Object.freeze([operation]) });
}
export function createPublicationPlan(context: InvocationContext, markerPath?: string): PublicationPlan {
  const build = resolveCurrentBuild({ packageRoot: context.packageRoot, canonicalSourceRoot: context.canonicalSourceRoot,
    controllerRoot: context.controllerRoot, targetRegistryPath: context.registryPath, selectedTargets: context.selectedTargetIds,
    mode: 'consumer' });
  const marker = markerPath === undefined ? null : readOptionalPublicationMarker(markerPath);
  const bindings: PublicationBindingPlan[] = [controllerBinding(context, build)];
  for (const manifest of build.selectedManifests) {
    for (const [localRoot, homeRoot] of Object.entries(manifest.homePolicy.bindings)) {
      const sourceRoot = build.outputPaths[localRoot];
      if (!sourceRoot) fail();
      const destinationRoot = safePublicationChild(context.homeRoot, homeRoot);
      bindings.push(targetBinding(manifest, manifest.name, localRoot, sourceRoot, destinationRoot, homeRoot, context.homeRoot, marker));
    }
  }
  bindings.sort((left, right) => left.order - right.order || PUBLICATION_BINDING_ORDER.indexOf(left.binding as never) - PUBLICATION_BINDING_ORDER.indexOf(right.binding as never));
  let priorOrder = -1;
  for (const binding of bindings) {
    const index = PUBLICATION_BINDING_ORDER.indexOf(binding.binding as never);
    if (index < 0 || index <= priorOrder) fail();
    priorOrder = index;
  }
  const changes = bindings.flatMap((binding) => binding.operations.map(({ target, binding: name, relativePath, action, beforeHash, intendedHash }) => ({
    target, path: name === relativePath ? name : `${name}/${relativePath}`, action, beforeHash, intendedHash
  })));
  if (changes.length > MAX_PUBLICATION_CHANGES) fail();
  const manifestPath = relative(context.packageRoot, build.manifestPath).split(sep).join('/');
  return Object.freeze({ build, buildManifestPath: normalizeRelativePath(manifestPath), buildManifestDigest: hashFile(build.manifestPath),
    selectedTargets: Object.freeze([...context.selectedTargetIds]), bindingOrder: Object.freeze(bindings.map(({ binding }) => binding)),
    bindings: Object.freeze(bindings), changes: Object.freeze(changes) });
}
