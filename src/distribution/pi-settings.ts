import { canonicalJsonBytes } from '../filesystem/hashing.js';
import { parseJsonDocument, type JsonValue } from '../protocol/json.js';

export const MANAGED_PI_PACKAGES = Object.freeze([
  'npm:pi-subagents@0.44.0',
  'npm:@juicesharp/rpiv-ask-user-question@2.4.0',
  'npm:@juicesharp/rpiv-todo@2.4.0'
] as const);
const MANAGED_BASES = Object.freeze(MANAGED_PI_PACKAGES.map((item) => item.slice(0, item.lastIndexOf('@'))));

export class PiSettingsError extends Error {}
export interface PiSettingsPlan {
  readonly action: 'merge-create' | 'merge-update' | 'noop' | 'conflict';
  readonly original: Uint8Array | null;
  readonly result: Uint8Array | null;
  readonly message?: string;
}
function fail(message: string): never { throw new PiSettingsError(message); }
function baseIdentity(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('npm:')) {
    const at = trimmed.lastIndexOf('@');
    if (at > 4) return trimmed.slice(0, at);
  }
  return trimmed;
}
function identity(entry: unknown): string | null {
  if (typeof entry === 'string') return entry;
  if (entry !== null && typeof entry === 'object' && !Array.isArray(entry)) {
    const record = entry as Record<string, unknown>;
    for (const key of ['source', 'package', 'name']) if (typeof record[key] === 'string') return record[key] as string;
  }
  return null;
}
function replaceIdentity(entry: unknown, packageName: string): JsonValue {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return packageName;
  const updated = JSON.parse(JSON.stringify(entry)) as Record<string, JsonValue>;
  for (const key of ['source', 'package', 'name']) {
    if (typeof updated[key] === 'string') { updated[key] = packageName; return updated; }
  }
  updated.source = packageName;
  return updated;
}
function valueAt(data: Record<string, JsonValue>, key: string): { parent: Record<string, JsonValue>; leaf: string; value: JsonValue | undefined } {
  const parts = key.split('.');
  let current = data;
  for (const part of parts.slice(0, -1)) {
    const value = current[part];
    if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(`Pi settings key is not an object path: ${key}`);
    current = value as Record<string, JsonValue>;
  }
  const leaf = parts.at(-1) as string;
  return { parent: current, leaf, value: current[leaf] };
}
function fragmentPackages(fragment: Uint8Array): readonly string[] {
  let parsed: JsonValue;
  try { parsed = parseJsonDocument(fragment); } catch { fail('Managed Pi settings fragment is invalid'); }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed) || !Array.isArray(parsed.packages)
    || parsed.packages.length !== MANAGED_PI_PACKAGES.length
    || parsed.packages.some((item, index) => item !== MANAGED_PI_PACKAGES[index])) {
    fail('Managed Pi package pins do not match the manifest contract');
  }
  return MANAGED_PI_PACKAGES;
}

export function planPiSettings(
  existing: Uint8Array | null,
  fragment: Uint8Array,
  options: { readonly managedKey?: string } = {}
): PiSettingsPlan {
  const packages = fragmentPackages(fragment);
  let data: Record<string, JsonValue>;
  if (existing === null) data = {};
  else {
    let parsed: JsonValue;
    try { parsed = parseJsonDocument(existing); } catch { fail('Pi settings are malformed'); }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) fail('Pi settings root must be an object');
    data = parsed as Record<string, JsonValue>;
  }
  const managedKey = options.managedKey ?? 'packages';
  const currentValue = valueAt(data, managedKey).value;
  const current = currentValue === undefined ? [] : currentValue;
  if (!Array.isArray(current)) fail(`Pi settings ${managedKey} must be a list`);
  const preserved: JsonValue[] = [];
  const templates = new Map<string, JsonValue>();
  for (const entry of current) {
    const value = identity(entry);
    const base = value === null ? null : baseIdentity(value);
    if (base === 'npm:pi-code' || base === 'pi-code') return { action: 'conflict', original: existing, result: null, message: 'Remove npm:pi-code manually before publication' };
    if (base !== null && MANAGED_BASES.includes(base)) {
      if (!templates.has(base)) templates.set(base, entry);
    } else preserved.push(entry);
  }
  const managed = packages.map((packageName, index) => {
    const template = templates.get(MANAGED_BASES[index]);
    return template === undefined ? packageName : replaceIdentity(template, packageName);
  });
  const updated = JSON.parse(JSON.stringify(data)) as Record<string, JsonValue>;
  const destination = valueAt(updated, managedKey);
  destination.parent[destination.leaf] = [...preserved, ...managed];
  const before = existing === null ? null : JSON.stringify(data);
  const after = JSON.stringify(updated);
  if (before === after) return { action: 'noop', original: existing, result: existing };
  return {
    action: existing === null ? 'merge-create' : 'merge-update',
    original: existing, result: canonicalJsonBytes(updated)
  };
}
