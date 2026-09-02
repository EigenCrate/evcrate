import { decodeJsonc, commentFreeJsonc, jsoncNewline, topLevelMembers, JsoncError } from './jsonc.js';

export class ManagedJsonError extends Error {}
export interface ManagedJsonPlan {
  readonly action: 'create' | 'update' | 'noop';
  readonly original: Uint8Array | null;
  readonly result: Uint8Array;
  readonly message?: string;
}

function fail(message: string): never { throw new ManagedJsonError(message); }

function members(text: string): ReturnType<typeof topLevelMembers> {
  try { return topLevelMembers(text); }
  catch (error) { throw new ManagedJsonError(error instanceof Error ? error.message : 'Invalid managed JSON'); }
}
function kind(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  return typeof value;
}
function sameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (kind(left) !== kind(right)) return false;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => sameValue(value, right[index]));
  }
  if (left !== null && right !== null && typeof left === 'object' && typeof right === 'object') {
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const keys = Object.keys(leftRecord);
    return keys.length === Object.keys(rightRecord).length
      && keys.every((key) => Object.hasOwn(rightRecord, key) && sameValue(leftRecord[key], rightRecord[key]));
  }
  return false;
}
function render(value: unknown): string {
  const result = JSON.stringify(value);
  if (result === undefined) fail('Managed JSON value is not serializable');
  return result;
}
function validateKeys(managedKeys: readonly string[], fragment: unknown): readonly string[] {
  if (!managedKeys.length || new Set(managedKeys).size !== managedKeys.length
    || managedKeys.some((key) => !key || key.includes('.'))) fail('managed_keys must be unique top-level names');
  if (fragment === null || typeof fragment !== 'object' || Array.isArray(fragment)) fail('Managed JSON fragment must be an object');
  const keys = Object.keys(fragment);
  if (keys.length !== managedKeys.length || keys.some((key) => !managedKeys.includes(key))) {
    fail('Managed JSON fragment keys must exactly match managed_keys');
  }
  return managedKeys;
}
function indent(text: string, rootStart: number, rootEnd: number): string {
  const match = text.slice(rootStart, rootEnd).match(/^[ \t]+(?=")/mu);
  return match?.[0] ?? '  ';
}
function insertMissing(
  text: string,
  rootStart: number,
  rootEnd: number,
  members: Record<string, [number, number]>,
  values: Record<string, unknown>,
  keys: readonly string[]
): string {
  const missing = keys.filter((key) => !Object.hasOwn(members, key));
  if (!missing.length) return text;
  const body = text.slice(rootStart + 1, rootEnd);
  const commentFree = commentFreeJsonc(text.slice(0, rootEnd));
  const trailingComma = commentFree.trimEnd().endsWith(',');
  const hasMembers = Object.keys(members).length > 0;
  const newline = jsoncNewline(text);
  const multiline = body.includes('\n') || body.includes('\r');
  const prefix = multiline ? (trailingComma || !hasMembers ? '' : ',') + newline : (trailingComma || !hasMembers ? '' : ', ');
  const rendered = missing.map((key) => `"${key}": ${render(values[key])}`).join(multiline ? `,${newline}${indent(text, rootStart, rootEnd)}` : ', ');
  const insertion = multiline
    ? `${prefix}${indent(text, rootStart, rootEnd)}${rendered}${newline}`
    : `${prefix}${rendered}`;
  return text.slice(0, rootEnd) + insertion + text.slice(rootEnd);
}
function parse(raw: Uint8Array, label: string): { text: string; value: unknown } {
  try { return decodeJsonc(raw, label); }
  catch (error) { throw new ManagedJsonError(error instanceof Error ? error.message : `Invalid ${label}`); }
}

export function planManagedJson(
  existing: Uint8Array | null,
  fragment: Uint8Array,
  options: { readonly managedKeys: readonly string[] }
): ManagedJsonPlan {
  const fragmentValue = parse(fragment, 'managed JSON fragment').value;
  const keys = validateKeys(options.managedKeys, fragmentValue);
  if (existing === null) {
    const parsed = fragmentValue as Record<string, unknown>;
    const body = new TextEncoder().encode(`${JSON.stringify(parsed, null, 2)}\n`);
    const bom = fragment[0] === 0xef && fragment[1] === 0xbb && fragment[2] === 0xbf
      ? fragment.slice(0, 3) : new Uint8Array();
    const result = new Uint8Array(bom.length + body.length);
    result.set(bom, 0); result.set(body, bom.length);
    return { action: 'create', original: null, result };
  }
  const existingParsed = parse(existing, 'existing managed JSON');
  if (existingParsed.value === null || typeof existingParsed.value !== 'object' || Array.isArray(existingParsed.value)) {
    fail('Existing managed JSON root must be an object');
  }
  const existingObject = existingParsed.value as Record<string, unknown>;
  const fragmentObject = fragmentValue as Record<string, unknown>;
  const memberSpans = members(existingParsed.text);
  for (const key of keys) {
    if (Object.hasOwn(existingObject, key) && kind(existingObject[key]) !== kind(fragmentObject[key])) {
      fail(`Managed JSON key ${key} changes type from ${kind(existingObject[key])} to ${kind(fragmentObject[key])}`);
    }
  }
  if (keys.every((key) => Object.hasOwn(existingObject, key) && sameValue(existingObject[key], fragmentObject[key]))) {
    return { action: 'noop', original: existing, result: existing };
  }
  let rendered = existingParsed.text;
  const replacements: Array<[number, number, string]> = [];
  for (const key of keys) {
    const span = memberSpans.members[key];
    if (span) replacements.push([span[0], span[1], render(fragmentObject[key])]);
  }
  for (const [start, end, value] of replacements.sort((left, right) => right[0] - left[0])) {
    rendered = rendered.slice(0, start) + value + rendered.slice(end);
  }
  if (keys.some((key) => !Object.hasOwn(memberSpans.members, key))) {
    const rescanned = members(rendered);
    rendered = insertMissing(rendered, rescanned.rootStart, rescanned.rootEnd, rescanned.members, fragmentObject, keys);
  }
  if (rendered === existingParsed.text) return { action: 'noop', original: existing, result: existing };
  const bom = existing[0] === 0xef && existing[1] === 0xbb && existing[2] === 0xbf ? existing.slice(0, 3) : new Uint8Array();
  const body = new TextEncoder().encode(rendered);
  const result = new Uint8Array(bom.length + body.length);
  result.set(bom, 0); result.set(body, bom.length);
  return { action: 'update', original: existing, result };
}

export { JsoncError };
