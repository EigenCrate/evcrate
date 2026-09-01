import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { assertNoSymlinkAncestors, assertRealDirectory } from '../filesystem/paths.js';
import { validateProjectId } from '../protocol/validation.js';

const PROJECT_HASH = /^[a-f0-9]{64}$/u;

export function projectIdentity(projectRoot: string): string {
  const root = resolve(projectRoot);
  assertNoSymlinkAncestors(root);
  assertRealDirectory(root);
  return createHash('sha256').update(root, 'utf8').digest('hex');
}

export function validateProjectIdentity(value: unknown): string {
  const identity = validateProjectId(value);
  if (!PROJECT_HASH.test(identity)) throw new ControlPlaneError('VALIDATION_INVALID');
  return identity;
}
