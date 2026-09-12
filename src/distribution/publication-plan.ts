import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import type {
  InvocationContext, SelectedTargetContext
} from '../context/invocation-context.js';
import type {
  ProjectDirectoryDescriptor, ProjectDocumentDescriptor, TargetManifest
} from '../manifests/types.js';
import { PERSISTED_TARGETS, type PersistedTarget } from '../protocol/validation.js';
import {
  MAX_PUBLICATION_BINDINGS, MAX_PUBLICATION_CHANGES, PUBLICATION_BINDING_ORDER,
  PUBLICATION_TARGET_BINDINGS, PUBLICATION_TARGET_LOCAL_ROOTS,
  type PublicationChange, type PublicationPhase, type PublicationScope, type PublicationTarget
} from '../protocol/publication-payloads.js';
import { normalizeRelativePath, pathOverlaps } from '../filesystem/paths.js';
import { hashBytes, readBoundedFile, completeTreeHash } from '../filesystem/hashing.js';
import { isPlainObject } from '../protocol/json.js';
import {
  buildManifestPath, resolveCurrentBuild, resolveCurrentPublicationBuild, type VerifiedCurrentBuild
} from './build-resolution.js';
import { assertPublicationRules, mapPublicationPath, publishFile } from './publication-rules.js';
import {
  MAX_PUBLICATION_FILE_BYTES, listPublicationFiles, publicationNode, safePublicationChild,
  validatePublicationAncestors, readOptionalPublicationMarker, controllerTreeHash,
  type PublicationNode, type PublicationNodeSnapshot
} from './publication-inventory.js';
import { planSharedJson, type SharedJsonPlan } from './shared-json.js';
import { validateAdvisorControllerProjection } from '../manifests/controller.js';
import { resolvePublicationProjectContext } from '../context/invocation-context.js';

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
  readonly kind: 'controller' | 'directory' | 'document';
  readonly managedPaths: readonly string[];
  readonly operations: readonly PlannedPublicationOperation[];
}

export interface PriorManagedOwnership {
  readonly [target: string]: Readonly<Record<string, readonly string[]>>;
}

export interface PublicationPhasePlan {
  readonly phase: PublicationPhase;
  readonly scope: PublicationScope;
  readonly destinationRoot: string;
  readonly projectIdentity: string | null;
  readonly build: VerifiedCurrentBuild;
  readonly buildManifestPath: string;
  readonly buildManifestDigest: string;
  readonly selectedTargets: readonly PersistedTarget[];
  readonly bindingOrder: readonly string[];
  readonly bindings: readonly PublicationBindingPlan[];
  readonly changes: readonly PublicationChange[];
  readonly managedOwnership: PriorManagedOwnership;
}

export interface PublicationPlanSet {
  readonly scope: PublicationScope;
  readonly projectIdentity: string | null;
  readonly build: VerifiedCurrentBuild;
  readonly buildManifestPath: string;
  readonly buildManifestDigest: string;
  readonly shared: PublicationPhasePlan;
  readonly harness: PublicationPhasePlan;
  readonly phases: readonly [PublicationPhasePlan, PublicationPhasePlan];
}

export interface PublicationPlanningOptions {
  readonly scope?: PublicationScope;
  readonly build?: VerifiedCurrentBuild;
  readonly priorManagedOwnership?: PriorManagedOwnership;
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

interface BindingDescriptor {
  readonly phase: PublicationPhase;
  readonly scope: PublicationScope;
  readonly target: PublicationTarget;
  readonly manifest: TargetManifest | null;
  readonly localRoot: string;
  readonly binding: string;
  readonly sourceRoot: string;
  readonly destinationRoot: string;
  readonly policyRoot: string;
  readonly order: number;
  readonly kind: 'controller' | 'directory' | 'document';
}

type Materialization = 'home' | 'project';
type MutableOwnership = Record<string, Record<string, readonly string[]>>;

function fail(
  code: 'PUBLICATION_FAILED' | 'PATH_UNSAFE' | 'PROTOCOL_INVALID' = 'PUBLICATION_FAILED'
): never {
  throw new ControlPlaneError(code);
}

function lexicalChild(root: string, value: string): string {
  const normalized = normalizeRelativePath(value);
  const resolvedRoot = resolve(root);
  const candidate = join(resolvedRoot, ...normalized.split('/'));
  const escaped = relative(resolvedRoot, resolve(candidate));
  if (!escaped || escaped === '..' || escaped.startsWith(`..${sep}`) || isAbsolute(escaped)) {
    fail('PATH_UNSAFE');
  }
  return candidate;
}

function assertHomeBindingMapping(manifest: TargetManifest): void {
  const target = manifest.id as PersistedTarget;
  const expectedLocalRoots = PUBLICATION_TARGET_LOCAL_ROOTS[target];
  const expectedBindings = PUBLICATION_TARGET_BINDINGS[target];
  const entries = Object.entries(manifest.homePolicy.bindings);
  if (expectedLocalRoots === undefined || expectedBindings === undefined
    || entries.length !== expectedLocalRoots.length || entries.length !== expectedBindings.length) {
    fail('PROTOCOL_INVALID');
  }
  for (const [localRoot, homeRoot] of entries) {
    if (!expectedLocalRoots.includes(localRoot) || !expectedBindings.includes(homeRoot)) {
      fail('PROTOCOL_INVALID');
    }
    const valid = target === 'antigravity'
      ? localRoot === '.antigravity' && homeRoot === '.gemini/config'
      : localRoot === homeRoot;
    if (!valid) fail('PROTOCOL_INVALID');
  }
}

function buildManifestRelativePath(context: InvocationContext, build: VerifiedCurrentBuild): string {
  const path = relative(context.packageRoot, build.manifestPath).split(sep).join('/');
  try { return normalizeRelativePath(path); } catch { fail('PATH_UNSAFE'); }
}

function normalizeOwnership(value: PriorManagedOwnership | undefined): PriorManagedOwnership {
  const result: MutableOwnership = {};
  if (value === undefined) return Object.freeze(result);
  if (!isPlainObject(value)) fail('PROTOCOL_INVALID');
  for (const [target, bindings] of Object.entries(value)) {
    if (!isPlainObject(bindings)) fail('PROTOCOL_INVALID');
    const targetResult: Record<string, readonly string[]> = {};
    for (const [binding, paths] of Object.entries(bindings)) {
      let normalizedBinding: string;
      try { normalizedBinding = normalizeRelativePath(binding); } catch { fail('PROTOCOL_INVALID'); }
      if (!Array.isArray(paths)) fail('PROTOCOL_INVALID');
      const normalized = paths.map((path) => {
        try { return normalizeRelativePath(path); } catch { fail('PROTOCOL_INVALID'); }
      });
      if (new Set(normalized).size !== normalized.length) fail('PROTOCOL_INVALID');
      targetResult[normalizedBinding] = Object.freeze(normalized);
    }
    result[target] = Object.freeze(targetResult);
  }
  return Object.freeze(result);
}

function priorPaths(
  ownership: PriorManagedOwnership, descriptor: BindingDescriptor
): Set<string> {
  const target = ownership[descriptor.target];
  if (!target) return new Set();
  const values = target[descriptor.binding] ?? target[descriptor.localRoot] ?? [];
  return new Set(values);
}

function ownershipWithBinding(
  ownership: PriorManagedOwnership, descriptor: BindingDescriptor, paths: readonly string[]
): PriorManagedOwnership {
  const result: MutableOwnership = {};
  for (const [target, bindings] of Object.entries(ownership)) {
    result[target] = {};
    for (const [binding, values] of Object.entries(bindings)) {
      result[target][binding] = Object.freeze([...values]);
    }
  }
  result[descriptor.target] ??= {};
  result[descriptor.target][descriptor.binding] = Object.freeze([...paths]);
  for (const [target, bindings] of Object.entries(result)) {
    result[target] = Object.freeze(bindings);
  }
  return Object.freeze(result);
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
    let normalized: string;
    try { normalized = normalizeRelativePath(value); } catch { fail(); }
    if (result.has(normalized)) fail();
    result.add(normalized);
  }
  return result;
}

function legacyOwnership(
  marker: Record<string, unknown> | null, manifests: readonly TargetManifest[]
): PriorManagedOwnership {
  const managed = marker?.managed_paths;
  if (managed === undefined) return Object.freeze({});
  if (!isPlainObject(managed)) fail();
  const result: MutableOwnership = {};
  for (const [localRoot, values] of Object.entries(managed)) {
    const matches = manifests.flatMap((manifest) =>
      Object.entries(manifest.homePolicy.bindings)
        .filter(([local]) => local === localRoot)
        .map(([local, binding]) => ({ manifest, local, binding }))
    );
    if (matches.length === 1) {
      const { manifest, binding } = matches[0];
      result[manifest.name] ??= {};
      result[manifest.name][binding] = Object.freeze([...markerPaths(marker, localRoot)]);
      continue;
    }
    if (matches.length === 0 && Array.isArray(values)) {
      let normalized: string[];
      try {
        normalized = values.map((value) => normalizeRelativePath(value));
      } catch { fail('PROTOCOL_INVALID'); }
      result.__legacy__ ??= {};
      result.__legacy__[localRoot] = Object.freeze(normalized);
    }
  }
  return normalizeOwnership(result);
}

function snapshotFor(
  node: PublicationNode, destination: string, controller = false
): PublicationNodeSnapshot {
  if (!node.present) return Object.freeze({ present: false });
  return Object.freeze({
    ...node,
    hash: node.kind === 'directory'
      ? (controller ? controllerTreeHash(destination) : completeTreeHash(destination))
      : node.hash
  });
}

function existing(destination: string): {
  readonly hash: string | null;
  readonly content: Uint8Array | null;
  readonly directory: boolean;
  readonly snapshot: PublicationNodeSnapshot;
} {
  const node = publicationNode(destination);
  const snapshot = snapshotFor(node, destination);
  if (!node.present) return { hash: null, content: null, directory: false, snapshot };
  if (node.kind === 'directory') return { hash: snapshot.hash as string, content: null, directory: true, snapshot };
  const content = readBoundedFile(destination, 16 * 1024 * 1024);
  return { hash: node.hash as string, content, directory: false, snapshot };
}
type PlannedOperationFields = Omit<PlannedPublicationOperation, 'content'>;

function plannedOperation(
  fields: PlannedOperationFields, content: Uint8Array | null
): PlannedPublicationOperation {
  const immutableContent = content === null ? null : content.slice();
  if (immutableContent !== null && immutableContent.byteLength > MAX_PUBLICATION_FILE_BYTES) {
    fail('PUBLICATION_FAILED');
  }
  return Object.freeze({
    ...fields,
    get content(): Uint8Array | null {
      return immutableContent === null ? null : immutableContent.slice();
    }
  });
}


function actionForFile(
  target: PublicationTarget, binding: string, localRoot: string, relativePath: string,
  destination: string, content: Uint8Array, prior: Set<string>, reject: boolean,
  preserve = false
): PlannedPublicationOperation {
  const current = existing(destination);
  const intendedHash = hashBytes(content);
  if (preserve) return plannedOperation({
    target, binding, localRoot, relativePath, destination, action: 'preserve',
    beforeHash: current.hash, beforeSnapshot: current.snapshot, intendedHash: current.hash
  }, null);
  if (current.directory) return plannedOperation({
    target, binding, localRoot, relativePath, destination, action: 'conflict',
    beforeHash: current.hash, beforeSnapshot: current.snapshot, intendedHash
  }, content);
  if (reject && !prior.has(relativePath) && current.hash !== null) {
    return plannedOperation({
      target, binding, localRoot, relativePath, destination, action: 'conflict',
      beforeHash: current.hash, beforeSnapshot: current.snapshot, intendedHash
    }, content);
  }
  const action = current.hash === null ? 'create' : current.hash === intendedHash ? 'noop' : 'update';
  return plannedOperation({
    target, binding, localRoot, relativePath, destination, action, beforeHash: current.hash,
    beforeSnapshot: current.snapshot, intendedHash
  }, content);
}


function materializeFile(
  manifest: TargetManifest, relativePath: string, content: Uint8Array,
  destinationRoot: string, materialization: Materialization
): { readonly relativePath: string; readonly content: Uint8Array } | null {
  if (materialization === 'project') {
    return Object.freeze({ relativePath: normalizeRelativePath(relativePath), content });
  }
  return publishFile(manifest, relativePath, content, destinationRoot);
}

function sharedOperation(
  descriptor: BindingDescriptor, materialization: Materialization
): PlannedPublicationOperation {
  const manifest = descriptor.manifest;
  if (manifest === null || manifest.sharedJson === null) fail();
  const spec = manifest.sharedJson;
  const rawFragment = readBoundedFile(
    safePublicationChild(descriptor.sourceRoot, spec.fragment), 16 * 1024 * 1024
  );
  const fragment = materializeFile(
    manifest, spec.fragment, rawFragment, descriptor.destinationRoot, materialization
  );
  if (fragment === null) fail();
  const relativePath = normalizeRelativePath(spec.destination);
  const destination = safePublicationChild(descriptor.destinationRoot, relativePath);
  const current = existing(destination);
  if (current.directory) return plannedOperation({
    target: descriptor.target, binding: descriptor.binding, localRoot: descriptor.localRoot,
    relativePath, destination, action: 'conflict', beforeHash: current.hash,
    beforeSnapshot: current.snapshot, intendedHash: null
  }, null);
  let planned: SharedJsonPlan;
  try { planned = planSharedJson(spec, current.content, fragment.content); }
  catch (error) { if (error instanceof ControlPlaneError) throw error; fail(); }
  if (planned.result === null) return plannedOperation({
    target: descriptor.target, binding: descriptor.binding, localRoot: descriptor.localRoot,
    relativePath, destination, action: 'conflict', beforeHash: current.hash,
    beforeSnapshot: current.snapshot, intendedHash: null
  }, null);
  const content = planned.result;
  return plannedOperation({
    target: descriptor.target, binding: descriptor.binding, localRoot: descriptor.localRoot,
    relativePath, destination, action: planned.action, beforeHash: current.hash,
    beforeSnapshot: current.snapshot, intendedHash: hashBytes(content)
  }, content);
}


function directoryBinding(
  descriptor: BindingDescriptor, ownership: PriorManagedOwnership, materialization: Materialization
): PublicationBindingPlan {
  const manifest = descriptor.manifest;
  if (manifest === null) fail();
  assertPublicationRules(manifest);
  const prior = priorPaths(ownership, descriptor);
  const files = listPublicationFiles(descriptor.sourceRoot);
  const spec = manifest.sharedJson && descriptor.localRoot === manifest.outputRoots[0]
    ? manifest.sharedJson : null;
  const sharedDestination = spec ? normalizeRelativePath(spec.destination) : null;
  const sharedFragment = spec ? normalizeRelativePath(spec.fragment) : null;
  const operations: PlannedPublicationOperation[] = [];
  const managed: string[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    if (file.relativePath === sharedFragment || file.relativePath === sharedDestination) continue;
    const published = materializeFile(
      manifest, file.relativePath, file.content, descriptor.destinationRoot, materialization
    );
    if (published === null) continue;
    if (seen.has(published.relativePath)) fail();
    seen.add(published.relativePath);
    const preserve = materialization === 'home'
      && (manifest.homePolicy.preservePaths[descriptor.localRoot] ?? [])
        .some((value) => mapPublicationPath(manifest, value) === published.relativePath);
    if (!preserve) managed.push(published.relativePath);
    operations.push(actionForFile(
      descriptor.target, descriptor.binding, descriptor.localRoot, published.relativePath,
      safePublicationChild(descriptor.destinationRoot, published.relativePath), published.content,
      prior, manifest.homePolicy.rejectUnmanagedCollisions, preserve
    ));
  }
  for (const stale of [...prior].sort()) {
    if (seen.has(stale) || managed.includes(stale) || (sharedDestination !== null && stale === sharedDestination)) continue;
    const destination = safePublicationChild(descriptor.destinationRoot, stale);
    const current = existing(destination);
    if (!current.hash && !current.directory) continue;
    operations.push(plannedOperation({
      target: descriptor.target, binding: descriptor.binding, localRoot: descriptor.localRoot,
      relativePath: stale, destination, action: current.directory ? 'conflict' : 'delete',
      beforeHash: current.hash, beforeSnapshot: current.snapshot, intendedHash: null
    }, null));
  }
  if (spec !== null) operations.push(sharedOperation(descriptor, materialization));
  return Object.freeze({
    target: descriptor.target, localRoot: descriptor.localRoot, binding: descriptor.binding,
    sourceRoot: descriptor.sourceRoot, destinationRoot: descriptor.destinationRoot, order: descriptor.order,
    controller: false, kind: descriptor.kind, managedPaths: Object.freeze([...managed].sort()),
    operations: Object.freeze(operations)
  });
}

function documentBinding(
  descriptor: BindingDescriptor, ownership: PriorManagedOwnership
): PublicationBindingPlan {
  const manifest = descriptor.manifest;
  if (manifest === null) fail();
  const source = publicationNode(descriptor.sourceRoot);
  if (!source.present || source.kind !== 'file') fail('PATH_UNSAFE');
  const content = readBoundedFile(descriptor.sourceRoot, 16 * 1024 * 1024);
  const relativePath = descriptor.binding;
  const destination = safePublicationChild(descriptor.destinationRoot, relativePath);
  const prior = priorPaths(ownership, descriptor);
  const operation = actionForFile(
    descriptor.target, descriptor.binding, descriptor.localRoot, relativePath, destination,
    content, prior, manifest.homePolicy.rejectUnmanagedCollisions
  );
  const operations: PlannedPublicationOperation[] = [operation];
  const managed = [relativePath];
  for (const stale of [...prior].sort()) {
    if (stale === relativePath) continue;
    const staleDestination = safePublicationChild(descriptor.destinationRoot, stale);
    const current = existing(staleDestination);
    if (!current.hash && !current.directory) continue;
    operations.push(plannedOperation({
      target: descriptor.target, binding: descriptor.binding, localRoot: descriptor.localRoot,
      relativePath: stale, destination: staleDestination,
      action: current.directory ? 'conflict' : 'delete', beforeHash: current.hash,
      beforeSnapshot: current.snapshot, intendedHash: null
    }, null));
  }
  return Object.freeze({
    target: descriptor.target, localRoot: descriptor.localRoot, binding: descriptor.binding,
    sourceRoot: descriptor.sourceRoot, destinationRoot: descriptor.destinationRoot, order: descriptor.order,
    controller: false, kind: 'document', managedPaths: Object.freeze(managed),
    operations: Object.freeze(operations)
  });
}

function controllerBinding(
  context: InvocationContext, descriptor: BindingDescriptor
): PublicationBindingPlan {
  validateAdvisorControllerProjection(context.controllerRoot, descriptor.sourceRoot);
  const current = publicationNode(descriptor.destinationRoot);
  if (current.present && current.kind !== 'directory') fail('PATH_UNSAFE');
  const intendedHash = controllerTreeHash(descriptor.sourceRoot, true);
  const currentSnapshot = snapshotFor(current, descriptor.destinationRoot, true);
  const beforeHash = currentSnapshot.present ? currentSnapshot.hash as string : null;
  const action = beforeHash === null ? 'create' : beforeHash === intendedHash ? 'noop' : 'update';
  const operation: PlannedPublicationOperation = plannedOperation({
    target: 'advisor-controller', binding: descriptor.binding, localRoot: descriptor.localRoot,
    relativePath: descriptor.binding, destination: descriptor.destinationRoot, action,
    beforeHash, beforeSnapshot: currentSnapshot, intendedHash
  }, null);
  return Object.freeze({
    target: 'advisor-controller', localRoot: descriptor.localRoot, binding: descriptor.binding,
    sourceRoot: descriptor.sourceRoot, destinationRoot: descriptor.destinationRoot, order: descriptor.order,
    controller: true, kind: 'controller', managedPaths: Object.freeze([]),
    operations: Object.freeze([operation])
  });
}

function planBinding(
  context: InvocationContext, descriptor: BindingDescriptor,
  ownership: PriorManagedOwnership, materialization: Materialization
): PublicationBindingPlan {
  if (descriptor.kind === 'controller') return controllerBinding(context, descriptor);
  if (descriptor.kind === 'document') return documentBinding(descriptor, ownership);
  return directoryBinding(descriptor, ownership, materialization);
}

function changeFor(
  binding: PublicationBindingPlan, operation: PlannedPublicationOperation
): PublicationChange {
  const path = binding.binding === operation.relativePath
    ? binding.binding : `${binding.binding}/${operation.relativePath}`;
  return Object.freeze({
    target: operation.target, path, action: operation.action,
    beforeHash: operation.beforeHash, intendedHash: operation.intendedHash
  });
}

function assertUniqueOperationDestinations(bindings: readonly PublicationBindingPlan[]): void {
  const destinations = new Set<string>();
  for (const binding of bindings) {
    for (const operation of binding.operations) {
      if (destinations.has(operation.destination)) fail('PROTOCOL_INVALID');
      destinations.add(operation.destination);
    }
  }
}

function assertAggregateBuild(context: InvocationContext, build: VerifiedCurrentBuild): void {
  const expectedManifestPath = buildManifestPath(context.packageRoot, []);
  if (resolve(build.manifestPath) !== resolve(expectedManifestPath)
    || build.manifest.schema_version !== 2
    || !isPlainObject(build.manifest.home_policy)
    || Object.keys(build.manifest.home_policy).length !== PERSISTED_TARGETS.length + 1
    || !Object.hasOwn(build.manifest.home_policy, 'advisor-controller')
    || PERSISTED_TARGETS.some((target) => !Object.hasOwn(build.manifest.home_policy, target))) {
    fail('PROTOCOL_INVALID');
  }
}

function phasePlan(
  context: InvocationContext, build: VerifiedCurrentBuild, phase: PublicationPhase,
  scope: PublicationScope, projectIdentity: string | null,
  destinationRoot: string, descriptors: readonly BindingDescriptor[], priorInput: PriorManagedOwnership
): PublicationPhasePlan {
  const prior = normalizeOwnership(priorInput);
  const materialization: Materialization = scope === 'home' ? 'home' : 'project';
  let managedOwnership = prior;
  const bindings: PublicationBindingPlan[] = [];
  let changeCount = 0;
  for (const descriptor of descriptors) {
    const binding = planBinding(context, descriptor, prior, materialization);
    bindings.push(binding);
    changeCount += binding.operations.length;
    if (changeCount > MAX_PUBLICATION_CHANGES) fail();
    managedOwnership = ownershipWithBinding(managedOwnership, descriptor, binding.managedPaths);
  }
  const frozenBindings = Object.freeze(bindings);
  assertUniqueOperationDestinations(frozenBindings);
  const changes = Object.freeze(frozenBindings.flatMap((binding) =>
    binding.operations.map((operation) => changeFor(binding, operation))
  ));
  if (changes.length > MAX_PUBLICATION_CHANGES) fail();
  return Object.freeze({
    phase, scope,
    destinationRoot,
    projectIdentity, build,
    buildManifestPath: buildManifestRelativePath(context, build),
    buildManifestDigest: build.manifestDigest,
    selectedTargets: Object.freeze(phase === 'shared' ? [] : [...context.selectedTargetIds]),
    bindingOrder: Object.freeze(frozenBindings.map(({ binding }) => binding)),
    bindings: frozenBindings, changes, managedOwnership
  });
}

function controllerDescriptor(context: InvocationContext, build: VerifiedCurrentBuild): BindingDescriptor {
  const output = build.outputPaths['.evcrate'];
  if (typeof output !== 'string') fail();
  return Object.freeze({
    phase: 'shared', scope: 'home', target: 'advisor-controller', manifest: null,
    localRoot: '.evcrate/bin', binding: '.evcrate/bin', sourceRoot: join(output, 'bin'),
    destinationRoot: lexicalChild(context.homeRoot, '.evcrate/bin'),
    policyRoot: context.homeRoot, order: 0, kind: 'controller'
  });
}

function assertBuildSelection(context: InvocationContext, build: VerifiedCurrentBuild): void {
  const actual = build.selectedManifests.map(({ id }) => id as PersistedTarget);
  if (actual.length !== context.selectedTargetIds.length
    || actual.some((target, index) => target !== context.selectedTargetIds[index])) {
    fail('PROTOCOL_INVALID');
  }
}

function homeDescriptors(
  context: InvocationContext, build: VerifiedCurrentBuild
): readonly BindingDescriptor[] {
  assertBuildSelection(context, build);
  const descriptors: BindingDescriptor[] = [];
  for (const manifest of build.selectedManifests) {
    assertHomeBindingMapping(manifest);
    for (const [localRoot, homeRoot] of Object.entries(manifest.homePolicy.bindings)) {
      const sourceRoot = build.outputPaths[localRoot];
      if (typeof sourceRoot !== 'string') fail();
      descriptors.push(Object.freeze({
        phase: 'harness', scope: 'home', target: manifest.name as PublicationTarget, manifest,
        localRoot, binding: homeRoot, sourceRoot,
        destinationRoot: lexicalChild(context.homeRoot, homeRoot),
        policyRoot: context.homeRoot, order: manifest.homePolicy.promotionOrder, kind: 'directory'
      }));
    }
  }
  const sorted = descriptors.sort((left, right) =>
    left.order - right.order
    || PUBLICATION_BINDING_ORDER.indexOf(left.binding as never) - PUBLICATION_BINDING_ORDER.indexOf(right.binding as never)
  );
  const expected = PUBLICATION_BINDING_ORDER.filter((binding) =>
    binding !== '.evcrate/bin' && sorted.some(({ binding: actual }) => actual === binding)
  );
  if (sorted.length !== expected.length || sorted.some(({ binding }, index) => binding !== expected[index])) {
    fail('PROTOCOL_INVALID');
  }
  return Object.freeze(sorted);
}

function selectedTargetContext(
  context: InvocationContext, target: PersistedTarget
): SelectedTargetContext {
  const selected = context.selectedTargets.find(({ id }) => id === target);
  if (!selected) fail('PROTOCOL_INVALID');
  return selected;
}

function projectDescriptors(
  context: InvocationContext, build: VerifiedCurrentBuild, identityRoot: string
): readonly BindingDescriptor[] {
  assertBuildSelection(context, build);
  const descriptors: BindingDescriptor[] = [];
  for (const manifest of build.selectedManifests) {
    const targetContext = selectedTargetContext(context, manifest.id as PersistedTarget);
    for (const descriptor of targetContext.projectDirectoryDescriptors) {
      descriptors.push(projectDirectoryDescriptor(manifest, descriptor, build, identityRoot));
    }
    for (const descriptor of targetContext.projectDocumentDescriptors) {
      descriptors.push(projectDocumentDescriptor(manifest, descriptor, build, identityRoot));
    }
  }
  return Object.freeze(descriptors);
}

function projectDirectoryDescriptor(
  manifest: TargetManifest, descriptor: ProjectDirectoryDescriptor,
  build: VerifiedCurrentBuild, identityRoot: string
): BindingDescriptor {
  const sourceRoot = build.outputPaths[descriptor.relativeDestination];
  if (typeof sourceRoot !== 'string') fail();
  return Object.freeze({
    phase: 'harness', scope: 'project', target: manifest.name as PublicationTarget, manifest,
    localRoot: descriptor.relativeDestination, binding: descriptor.relativeDestination, sourceRoot,
    destinationRoot: lexicalChild(identityRoot, descriptor.relativeDestination),
    policyRoot: identityRoot, order: descriptor.declarationIndex, kind: 'directory'
  });
}

function projectDocumentDescriptor(
  manifest: TargetManifest, descriptor: ProjectDocumentDescriptor,
  build: VerifiedCurrentBuild, identityRoot: string
): BindingDescriptor {
  const sourceRoot = build.outputPaths[descriptor.relativeDestination];
  if (typeof sourceRoot !== 'string') fail();
  return Object.freeze({
    phase: 'harness', scope: 'project', target: manifest.name as PublicationTarget, manifest,
    localRoot: descriptor.relativeDestination, binding: descriptor.relativeDestination, sourceRoot,
    destinationRoot: identityRoot, policyRoot: identityRoot,
    order: descriptor.declarationIndex, kind: 'document'
  });
}

function destinationPath(descriptor: BindingDescriptor): string {
  return descriptor.kind === 'document'
    ? lexicalChild(descriptor.destinationRoot, descriptor.binding)
    : descriptor.destinationRoot;
}

function allowedHomeOverlap(left: BindingDescriptor, right: BindingDescriptor): boolean {
  const parent = left.binding === '.gemini' && right.binding === '.gemini/config'
    ? left : right.binding === '.gemini' && left.binding === '.gemini/config' ? right : null;
  const child = parent === left ? right : parent === right ? left : null;
  return parent !== null && child !== null
    && parent.phase === 'harness' && parent.scope === 'home'
    && child.phase === 'harness' && child.scope === 'home'
    && parent.target === 'gemini' && parent.localRoot === '.gemini'
    && child.target === 'antigravity' && child.localRoot === '.antigravity'
    && parent.order < child.order;
}

function assertDescriptorShape(descriptor: BindingDescriptor): void {
  if (descriptor.kind === 'controller') {
    if (descriptor.phase !== 'shared' || descriptor.scope !== 'home'
      || descriptor.target !== 'advisor-controller' || descriptor.manifest !== null
      || descriptor.localRoot !== '.evcrate/bin' || descriptor.binding !== '.evcrate/bin') {
      fail('PROTOCOL_INVALID');
    }
    return;
  }
  if (descriptor.kind !== 'directory' && descriptor.kind !== 'document') fail('PROTOCOL_INVALID');
  const manifest = descriptor.manifest;
  if (descriptor.phase !== 'harness' || manifest === null
    || descriptor.target === 'advisor-controller'
    || manifest.id !== descriptor.target || manifest.name !== descriptor.target) {
    fail('PROTOCOL_INVALID');
  }
  if (descriptor.scope === 'home') {
    assertHomeBindingMapping(manifest);
    if (manifest.homePolicy.bindings[descriptor.localRoot] !== descriptor.binding) {
      fail('PROTOCOL_INVALID');
    }
    return;
  }
  if (descriptor.scope !== 'project' || descriptor.localRoot !== descriptor.binding) {
    fail('PROTOCOL_INVALID');
  }
}

function preflightDescriptors(descriptors: readonly BindingDescriptor[]): void {
  if (descriptors.length === 0 || descriptors.length > MAX_PUBLICATION_BINDINGS) fail('PROTOCOL_INVALID');
  const bindings = new Set<string>();
  const destinations: Array<{ descriptor: BindingDescriptor; path: string }> = [];
  for (const descriptor of descriptors) {
    assertDescriptorShape(descriptor);
    try {
      normalizeRelativePath(descriptor.binding);
      normalizeRelativePath(descriptor.localRoot);
    } catch { fail('PROTOCOL_INVALID'); }
    const key = `${descriptor.phase}:${descriptor.scope}:${descriptor.binding}`;
    if (bindings.has(key)) fail('PROTOCOL_INVALID');
    bindings.add(key);
    destinations.push({ descriptor, path: destinationPath(descriptor) });
  }
  for (let i = 0; i < destinations.length; i += 1) {
    for (let j = i + 1; j < destinations.length; j += 1) {
      const left = destinations[i];
      const right = destinations[j];
      if (pathOverlaps(left.path, right.path) && !allowedHomeOverlap(left.descriptor, right.descriptor)) {
        fail('PROTOCOL_INVALID');
      }
    }
  }
  for (const { descriptor, path } of destinations) {
    validatePublicationAncestors(
      descriptor.policyRoot, descriptor.kind === 'document' ? dirname(path) : path
    );
  }
}


export function createSharedPublicationPlan(
  context: InvocationContext, build: VerifiedCurrentBuild,
  priorManagedOwnership: PriorManagedOwnership = {}
): PublicationPhasePlan {
  assertAggregateBuild(context, build);
  const descriptors = [controllerDescriptor(context, build)];
  preflightDescriptors(descriptors);
  return phasePlan(context, build, 'shared', 'home', null, context.homeRoot, descriptors, priorManagedOwnership);
}

export function createHomeHarnessPublicationPlan(
  context: InvocationContext, build: VerifiedCurrentBuild,
  priorManagedOwnership: PriorManagedOwnership = {}
): PublicationPhasePlan {
  assertAggregateBuild(context, build);
  const descriptors = homeDescriptors(context, build);
  preflightDescriptors([controllerDescriptor(context, build), ...descriptors]);
  return phasePlan(context, build, 'harness', 'home', null, context.homeRoot, descriptors, priorManagedOwnership);
}

export function createProjectHarnessPublicationPlan(
  context: InvocationContext, build: VerifiedCurrentBuild,
  priorManagedOwnership: PriorManagedOwnership = {}
): PublicationPhasePlan {
  assertAggregateBuild(context, build);
  const identity = resolvePublicationProjectContext(context);
  const descriptors = projectDescriptors(context, build, identity.canonicalRoot);
  preflightDescriptors([controllerDescriptor(context, build), ...descriptors]);
  return phasePlan(
    context, build, 'harness', 'project', identity.projectIdentity,
    identity.canonicalRoot, descriptors, priorManagedOwnership
  );
}

export function createPublicationPlanSet(
  context: InvocationContext, options: PublicationPlanningOptions = {}
): PublicationPlanSet {
  const scope = options.scope ?? 'home';
  if (scope !== 'home' && scope !== 'project') fail('PROTOCOL_INVALID');
  const build = options.build ?? resolveCurrentPublicationBuild({
    packageRoot: context.packageRoot, canonicalSourceRoot: context.canonicalSourceRoot,
    controllerRoot: context.controllerRoot, targetRegistryPath: context.registryPath,
    selectedTargets: context.selectedTargetIds, mode: 'consumer'
  });
  assertAggregateBuild(context, build);
  const prior = normalizeOwnership(options.priorManagedOwnership);
  const identity = scope === 'project' ? resolvePublicationProjectContext(context) : null;
  const sharedDescriptors = [controllerDescriptor(context, build)];
  const harnessDescriptors = scope === 'project'
    ? projectDescriptors(context, build, identity?.canonicalRoot ?? fail('PATH_UNSAFE'))
    : homeDescriptors(context, build);
  preflightDescriptors([...sharedDescriptors, ...harnessDescriptors]);
  const shared = phasePlan(
    context, build, 'shared', 'home', null, context.homeRoot, sharedDescriptors, prior
  );
  const harness = phasePlan(
    context, build, 'harness', scope, identity?.projectIdentity ?? null,
    scope === 'project' ? identity?.canonicalRoot ?? fail('PATH_UNSAFE') : context.homeRoot,
    harnessDescriptors, prior
  );
  return Object.freeze({
    scope, projectIdentity: identity?.projectIdentity ?? null, build,
    buildManifestPath: shared.buildManifestPath, buildManifestDigest: shared.buildManifestDigest,
    shared, harness,
    phases: Object.freeze([shared, harness]) as readonly [PublicationPhasePlan, PublicationPhasePlan]
  });
}

function composeLegacyPlan(
  context: InvocationContext, build: VerifiedCurrentBuild,
  shared: PublicationPhasePlan, harness: PublicationPhasePlan
): PublicationPlan {
  const bindings = Object.freeze([...shared.bindings, ...harness.bindings]);
  const changes = Object.freeze([...shared.changes, ...harness.changes]);
  if (changes.length > MAX_PUBLICATION_CHANGES) fail();
  return Object.freeze({
    build, buildManifestPath: shared.buildManifestPath, buildManifestDigest: shared.buildManifestDigest,
    selectedTargets: Object.freeze([...context.selectedTargetIds]),
    bindingOrder: Object.freeze(bindings.map(({ binding }) => binding)), bindings, changes
  });
}

/**
 * Compatibility composer for the Phase 05-owned publication caller.
 * It keeps the legacy selected-manifest HOME path while sharing one build
 * object across the shared and harness planners.
 */
export function createPublicationPlan(
  context: InvocationContext, markerPath?: string
): PublicationPlan {
  const build = resolveCurrentBuild({
    packageRoot: context.packageRoot, canonicalSourceRoot: context.canonicalSourceRoot,
    controllerRoot: context.controllerRoot, targetRegistryPath: context.registryPath,
    selectedTargets: context.selectedTargetIds, mode: 'consumer'
  });
  const marker = markerPath === undefined ? null : readOptionalPublicationMarker(markerPath);
  const prior = legacyOwnership(marker, build.selectedManifests);
  const sharedDescriptors = [controllerDescriptor(context, build)];
  const harnessDescriptors = homeDescriptors(context, build);
  preflightDescriptors([...sharedDescriptors, ...harnessDescriptors]);
  const shared = phasePlan(
    context, build, 'shared', 'home', null, context.homeRoot, sharedDescriptors, prior
  );
  const harness = phasePlan(
    context, build, 'harness', 'home', null, context.homeRoot, harnessDescriptors, prior
  );
  return composeLegacyPlan(context, build, shared, harness);
}
