import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { assertNoSymlinkAncestors, assertRealDirectory } from '../filesystem/paths.js';
import { validateProjectId } from '../protocol/validation.js';

const PROJECT_HASH = /^[a-f0-9]{64}$/u;

export interface PublicationProjectIdentity {
  readonly canonicalRoot: string;
  readonly projectIdentity: string;
}

export function canonicalProjectRoot(projectRoot: string): string {
  const root = resolve(projectRoot);
  assertNoSymlinkAncestors(root);
  assertRealDirectory(root);
  let canonical: string;
  try {
    canonical = realpathSync.native ? realpathSync.native(root) : realpathSync(root);
  } catch (error) {
    if (error instanceof ControlPlaneError) throw error;
    throw new ControlPlaneError('PATH_UNSAFE');
  }
  assertNoSymlinkAncestors(canonical);
  assertRealDirectory(canonical);
  return canonical;
}

export function resolvePublicationProjectIdentity(projectRoot: string): PublicationProjectIdentity {
  const canonicalRoot = canonicalProjectRoot(projectRoot);
  const identity = createHash('sha256').update(canonicalRoot, 'utf8').digest('hex');
  return Object.freeze({
    canonicalRoot,
    projectIdentity: identity
  });
}

export function projectIdentity(projectRoot: string): string {
  return resolvePublicationProjectIdentity(projectRoot).projectIdentity;
}

export function validateProjectIdentity(value: unknown): string {
  const identity = validateProjectId(value);
  if (!PROJECT_HASH.test(identity)) throw new ControlPlaneError('VALIDATION_INVALID');
  return identity;
}

