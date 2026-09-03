import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { canonicalJsonBytes, hashFile, treeHash } from '../filesystem/hashing.js';
import { containedPath } from '../filesystem/paths.js';
import { normalizeTarget, type PersistedTarget } from '../protocol/validation.js';
import {
  loadSelectedManifests, loadTargetManifestRegistry, manifestAdapterHashes, manifestSourceHashes
} from '../manifests/registry.js';
import type { BuildManifest, TargetManifest } from '../manifests/types.js';
import { readBuildManifest, verifyBuild } from './manifest.js';

export interface CurrentBuildOptions {
  readonly packageRoot: string;
  readonly canonicalSourceRoot: string;
  readonly controllerRoot: string;
  readonly targetRegistryPath: string;
  readonly selectedTargets: readonly PersistedTarget[];
  readonly mode?: 'authoring' | 'consumer';
}

export interface VerifiedCurrentBuild {
  readonly manifestPath: string;
  readonly manifest: BuildManifest;
  readonly selectedManifests: readonly TargetManifest[];
  readonly outputPaths: Readonly<Record<string, string>>;
}
function fail(code: 'PROTOCOL_INVALID' | 'PATH_UNSAFE' | 'PUBLICATION_FAILED'): never {
  throw new ControlPlaneError(code);
}

function sameJson(left: unknown, right: unknown): boolean {
  return Buffer.from(canonicalJsonBytes(left)).equals(Buffer.from(canonicalJsonBytes(right)));
}

function expectedPolicy(manifests: readonly TargetManifest[]): Record<string, unknown> {
  const result: Record<string, unknown> = {
    'advisor-controller': {
      bindings: { '.evcrate/bin': '.evcrate/bin' },
      preserve_paths: {},
      promotion_order: 5
    }
  };
  for (const manifest of manifests) {
    const policy = manifest.homePolicy;
    const value: Record<string, unknown> = {
      bindings: { ...policy.bindings },
      preserve_paths: Object.fromEntries(
        Object.entries(policy.preservePaths).map(([root, paths]) => [root, [...paths]])
      ),
      promotion_order: policy.promotionOrder
    };
    if (policy.rejectUnmanagedCollisions) value.reject_unmanaged_collisions = true;
    if (policy.publicationRules.length) value.publication_rules = [...policy.publicationRules];
    result[manifest.name] = value;
  }
  return result;
}

function currentSourceHashes(
  options: CurrentBuildOptions,
  manifests: readonly TargetManifest[],
  allTargets: boolean
): Record<string, string> {
  const sourceRoot = options.canonicalSourceRoot;
  const parent = dirname(sourceRoot);
  const values: Record<string, string> = {
    '.claude': treeHash(sourceRoot),
    'CLAUDE.md': hashFile(join(parent, 'CLAUDE.md')),
    ...manifestSourceHashes(manifests)
  };
  if (allTargets) values['.evcrate/targets'] = treeHash(join(options.packageRoot, '.evcrate', 'targets'));
  return values;
}

function expectedOutputPaths(
  canonicalSourceRoot: string,
  manifests: readonly TargetManifest[]
): Record<string, string> {
  const parent = dirname(canonicalSourceRoot);
  const names = new Set<string>(['.evcrate']);
  for (const manifest of manifests) {
    for (const root of manifest.outputRoots) names.add(root);
    for (const document of manifest.projectDocs) names.add(document);
  }
  const result: Record<string, string> = {};
  for (const name of names) result[name] = containedPath(parent, name, true);
  return result;
}
function hasAuthoringSources(options: CurrentBuildOptions, manifests: readonly TargetManifest[]): boolean {
  const claudeDoc = join(options.packageRoot, 'CLAUDE.md');
  if (!existsSync(claudeDoc)) return false;
  for (const manifest of manifests) {
    for (const path of [manifest.adapter, ...manifest.adapterSources].filter((value): value is string => value !== null)) {
      try {
        const fullPath = containedPath(options.packageRoot, path, false);
        if (!existsSync(fullPath)) return false;
      } catch {
        return false;
      }
    }
  }
  return true;
}


function assertOwners(
  manifest: BuildManifest,
  outputPaths: Readonly<Record<string, string>>,
  selected: readonly TargetManifest[]
): void {
  const owners = manifest.owners;
  const allowed = new Set<string>(['baseline', 'advisor-controller', ...selected.map(({ name }) => name)]);
  const roots = Object.keys(outputPaths);
  for (const [key, owner] of Object.entries(owners)) {
    if (!allowed.has(owner) || !roots.some((root) => key === root || key.startsWith(`${root}/`))) fail('PUBLICATION_FAILED');
    if (owner === 'advisor-controller' && !key.startsWith('.evcrate/bin/')) fail('PUBLICATION_FAILED');
    if (owner !== 'advisor-controller' && key.startsWith('.evcrate/bin/')) fail('PUBLICATION_FAILED');
  }
  for (const key of Object.keys(manifest.controller_hashes)) {
    if (owners[key] !== 'advisor-controller') fail('PUBLICATION_FAILED');
  }
}


function assertValidation(manifest: BuildManifest): void {
  if (manifest.validation.complete !== true
    || manifest.validation.target_registry !== 'validated'
    || manifest.validation.symlinks !== 'rejected') fail('PUBLICATION_FAILED');
  const controller = manifest.validation.advisor_controller;
  if (!controller || typeof controller !== 'object' || Array.isArray(controller)) fail('PUBLICATION_FAILED');
  const metadata = controller as Record<string, unknown>;
  if (metadata.schema !== 'evcrate-advisor-controller/v1' || metadata.root !== '.evcrate/bin'
    || metadata.entrypoint !== 'evcrate-advisor' || metadata.parity !== 'byte-identical') fail('PUBLICATION_FAILED');
}

export function buildManifestPath(packageRoot: string, selectedTargets: readonly PersistedTarget[]): string {
  if (selectedTargets.length === 1) return join(packageRoot, '.evcrate', `build-manifest-${selectedTargets[0]}.json`);
  return join(packageRoot, '.evcrate', 'build-manifest.json');
}

export function resolveCurrentBuild(options: CurrentBuildOptions): VerifiedCurrentBuild {
  const registry = loadTargetManifestRegistry(options.targetRegistryPath);
  const selected = loadSelectedManifests(registry, options.selectedTargets.map((target) => normalizeTarget(target)));
  const allTargets = selected.length === registry.targets.size
    && selected.every((manifest) => registry.targets.has(manifest.id as PersistedTarget));
  const manifestPath = buildManifestPath(options.packageRoot, selected.map(({ id }) => id as PersistedTarget));
  const manifest = readBuildManifest(manifestPath);
  assertValidation(manifest);
  if (!sameJson(manifest.home_policy, expectedPolicy(selected))) fail('PUBLICATION_FAILED');
  const outputPaths = expectedOutputPaths(options.canonicalSourceRoot, selected);
  assertOwners(manifest, outputPaths, selected);
  if (!sameJson(Object.keys(manifest.output_hashes).sort(), Object.keys(outputPaths).sort())) fail('PUBLICATION_FAILED');
  const isConsumer = options.mode === 'consumer' || (options.mode !== 'authoring' && !hasAuthoringSources(options, selected));
  if (isConsumer) {
    verifyBuild({ manifestPath, outputRoots: outputPaths, controllerRoot: options.controllerRoot });
  } else {
    const sourceHashes = currentSourceHashes(options, selected, allTargets);
    const adapterHashes = manifestAdapterHashes(selected, options.packageRoot);
    verifyBuild({ manifestPath, outputRoots: outputPaths, controllerRoot: options.controllerRoot, sourceHashes, adapterHashes });
  }
  return Object.freeze({ manifestPath, manifest, selectedManifests: selected, outputPaths: Object.freeze(outputPaths) });
}
