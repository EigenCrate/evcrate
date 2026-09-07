import { createHash } from 'node:crypto';
import { constants, fstatSync, lstatSync, openSync, readSync, closeSync, mkdirSync, chmodSync } from 'node:fs';
import type { Stats } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { parseJsonDocument } from '../protocol/json.js';
import {
  canonicalAdvisorPolicyDigest, safeAdvisorPolicyView, validateAdvisorPolicy,
  type AdvisorPolicy, type SafeAdvisorPolicyView, type SettingsMode, type SettingsRevision
} from '../protocol/advisor-settings.js';
import { assertNoSymlinkAncestors, assertOwnerOnlyDirectory } from '../filesystem/paths.js';

const MAX_POLICY_BYTES = 16 * 1024;
const NO_FOLLOW = constants.O_NOFOLLOW ?? 0;
export interface AdvisorPolicySnapshot {
  readonly path: string;
  readonly policy: SafeAdvisorPolicyView | null;
  readonly bytes: Uint8Array | null;
  readonly revision: SettingsRevision;
  readonly mode: SettingsMode | null;
}
function fail(code: 'PATH_UNSAFE' | 'SETTINGS_INVALID'): never { throw new ControlPlaneError(code); }
function existing(path: string): Stats | null {
  try { return lstatSync(path) as Stats; } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    fail('PATH_UNSAFE');
  }
  return null;
}
function modeOf(stat: Stats): number { return Number(stat.mode) & 0o777; }
function safePolicyFile(stat: Stats): void {
  if (stat.isSymbolicLink() || !stat.isFile()) fail('PATH_UNSAFE');
  if (typeof process.getuid === 'function' && Number(stat.uid) !== process.getuid()) fail('PATH_UNSAFE');
  if (process.platform !== 'win32' && modeOf(stat) & 0o077) fail('PATH_UNSAFE');
}
function identity(stat: Stats, bytes: Uint8Array): string {
  const metadata = `${Number(stat.dev)}:${Number(stat.ino)}:${Number(stat.size)}:${stat.mtimeMs}:${modeOf(stat)}`;
  return createHash('sha256').update(metadata).update('\0').update(bytes).digest('hex');
}
function absent(path: string): AdvisorPolicySnapshot {
  assertNoSymlinkAncestors(dirname(path));
  return Object.freeze({ path, policy: null, bytes: null,
    revision: { kind: 'absent' as const, identity: 'absent' }, mode: null });
}
function readBytes(path: string, stat: Stats): Uint8Array {
  if (Number(stat.size) > MAX_POLICY_BYTES) fail('SETTINGS_INVALID');
  const descriptor = openSync(path, constants.O_RDONLY | NO_FOLLOW);
  try {
    const opened = fstatSync(descriptor) as Stats;
    safePolicyFile(opened);
    if (Number(opened.dev) !== Number(stat.dev) || Number(opened.ino) !== Number(stat.ino)
      || Number(opened.size) !== Number(stat.size)) fail('PATH_UNSAFE');
    const bytes = Buffer.alloc(Number(opened.size));
    let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(descriptor, bytes, offset, bytes.length - offset, offset);
      if (!count) fail('PATH_UNSAFE');
      offset += count;
    }
    const final = fstatSync(descriptor) as Stats;
    const current = existing(path);
    if (!current || Number(final.dev) !== Number(opened.dev) || Number(final.ino) !== Number(opened.ino)
      || Number(final.size) !== Number(opened.size) || Number(current.ino) !== Number(final.ino)) fail('PATH_UNSAFE');
    safePolicyFile(final);
    return bytes;
  } finally { closeSync(descriptor); }
}
export function readAdvisorPolicy(pathValue: string): AdvisorPolicySnapshot {
  const path = resolve(pathValue);
  assertNoSymlinkAncestors(path);
  const parent = dirname(path);
  if (existing(parent)) assertOwnerOnlyDirectory(parent);
  const stat = existing(path);
  if (!stat) return absent(path);
  safePolicyFile(stat);
  const bytes = readBytes(path, stat);
  let policy: SafeAdvisorPolicyView;
  try {
    const parsed = parseJsonDocument(bytes, MAX_POLICY_BYTES);
    policy = safeAdvisorPolicyView(parsed);
  } catch (error) {
    if (error instanceof ControlPlaneError) throw error;
    fail('SETTINGS_INVALID');
  }
  return Object.freeze({ path, policy, bytes: Uint8Array.from(bytes),
    revision: { kind: 'present' as const, identity: identity(stat, bytes) },
    mode: { kind: 'existing' as const, mode: modeOf(stat) } });
}
export function revisionsEqual(left: SettingsRevision, right: SettingsRevision): boolean {
  return left.kind === right.kind && left.identity === right.identity;
}
export function policyDigest(policy: unknown): string { return canonicalAdvisorPolicyDigest(policy); }
export function ensureAdvisorPolicyParent(pathValue: string): string {
  const parent = dirname(resolve(pathValue));
  assertNoSymlinkAncestors(parent);
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  assertOwnerOnlyDirectory(parent);
  if (process.platform !== 'win32') chmodSync(parent, 0o700);
  return parent;
}
