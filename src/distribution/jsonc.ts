import type { JsonValue } from '../protocol/json.js';
import { MAX_JSON_DEPTH } from '../protocol/json.js';
export class JsoncError extends Error {}

const MAX_JSONC_TEXT_BYTES = 16 * 1024 * 1024;
const MAX_JSONC_NODES = 100_000;
interface ScanState { nodes: number; }

function withoutComments(text: string): string {
  const chars = text.split('');
  let index = 0;
  let inString = false;
  let escaped = false;
  while (index < chars.length) {
    const char = chars[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      index += 1;
      continue;
    }
    if (char === '"') { inString = true; index += 1; continue; }
    if (char !== '/' || !['/', '*'].includes(chars[index + 1] ?? '')) { index += 1; continue; }
    const block = chars[index + 1] === '*';
    chars[index] = chars[index + 1] = ' ';
    index += 2;
    let terminated = !block;
    while (index < chars.length) {
      if (!block && (chars[index] === '\n' || chars[index] === '\r')) { terminated = true; break; }
      if (block && chars[index] === '*' && chars[index + 1] === '/') {
        chars[index] = chars[index + 1] = ' ';
        index += 2;
        terminated = true;
        break;
      }
      if (chars[index] !== '\n' && chars[index] !== '\r') chars[index] = ' ';
      index += 1;
    }
    if (block && !terminated) throw new JsoncError('Unterminated JSONC block comment');
  }
  if (inString || escaped) throw new JsoncError('Unterminated JSON string');
  return chars.join('');
}
export function commentFreeJsonc(text: string): string {
  return withoutComments(text);
}

function withoutTrailingCommas(text: string): string {
  const chars = text.split('');
  let index = 0;
  let inString = false;
  let escaped = false;
  while (index < chars.length) {
    const char = chars[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      index += 1;
      continue;
    }
    if (char === '"') { inString = true; index += 1; continue; }
    if (char === ',') {
      let probe = index + 1;
      while (/\s/u.test(chars[probe] ?? '')) probe += 1;
      if (chars[probe] === '}' || chars[probe] === ']') chars[index] = ' ';
    }
    index += 1;
  }
  return chars.join('');
}

function skipWhitespace(text: string, index: number): number {
  while (/\s/u.test(text[index] ?? '')) index += 1;
  return index;
}
function stringEnd(text: string, start: number): number {
  let index = start + 1;
  let escaped = false;
  while (index < text.length) {
    const char = text[index];
    if (escaped) escaped = false;
    else if (char === '\\') escaped = true;
    else if (char === '"') {
      try { JSON.parse(text.slice(start, index + 1)); } catch { throw new JsoncError('Invalid JSON string'); }
      return index + 1;
    }
    index += 1;
  }
  throw new JsoncError('Unterminated JSON string');
}
function valueEnd(text: string, start: number, state: ScanState, depth: number): number {
  if (depth > MAX_JSON_DEPTH || ++state.nodes > MAX_JSONC_NODES) {
    throw new JsoncError('JSONC document is too complex');
  }
  const char = text[start];
  if (char === '"') return stringEnd(text, start);
  if (char === '{') {
    const keys = new Set<string>();
    let index = skipWhitespace(text, start + 1);
    if (text[index] === '}') return index + 1;
    while (true) {
      if (text[index] !== '"') throw new JsoncError('Object key must be a string');
      const end = stringEnd(text, index);
      const key = JSON.parse(text.slice(index, end)) as string;
      if (keys.has(key)) throw new JsoncError(`Duplicate JSON key: ${key}`);
      keys.add(key);
      index = skipWhitespace(text, end);
      if (text[index] !== ':') throw new JsoncError('Object key has no value');
      index = skipWhitespace(text, index + 1);
      index = valueEnd(text, index, state, depth + 1);
      index = skipWhitespace(text, index);
      if (text[index] === '}') return index + 1;
      if (text[index] !== ',') throw new JsoncError('Object separator is invalid');
      index = skipWhitespace(text, index + 1);
      if (text[index] === '}') return index + 1;
    }
  }
  if (char === '[') {
    let index = skipWhitespace(text, start + 1);
    if (text[index] === ']') return index + 1;
    while (true) {
      index = valueEnd(text, index, state, depth + 1);
      index = skipWhitespace(text, index);
      if (text[index] === ']') return index + 1;
      if (text[index] !== ',') throw new JsoncError('Array separator is invalid');
      index = skipWhitespace(text, index + 1);
      if (text[index] === ']') return index + 1;
    }
  }
  const match = text.slice(start).match(/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/u);
  if (!match) throw new JsoncError('JSON value is invalid');
  if (!/^(?:true|false|null)$/u.test(match[0]) && !Number.isFinite(Number(match[0]))) {
    throw new JsoncError('JSON number is not finite');
  }
  return start + match[0].length;
}
export function decodeJsonc(raw: Uint8Array, label: string): { text: string; value: JsonValue } {
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(raw); }
  catch { throw new JsoncError(`${label} is not UTF-8`); }
  if (text.startsWith('\ufeff')) text = text.slice(1);
  const cleaned = withoutTrailingCommas(withoutComments(text));
  const start = skipWhitespace(cleaned, 0);
  try {
    const end = valueEnd(cleaned, start, { nodes: 0 }, 0);
    if (skipWhitespace(cleaned, end) !== cleaned.length) throw new JsoncError('Trailing JSON data');
    return { text, value: JSON.parse(cleaned) as JsonValue };
  } catch (error) {
    if (error instanceof JsoncError) throw error;
    throw new JsoncError(`Invalid ${label}`);
  }
}

export function topLevelMembers(text: string): { rootStart: number; rootEnd: number; members: Record<string, [number, number]> } {
  if (Buffer.byteLength(text, 'utf8') > MAX_JSONC_TEXT_BYTES) throw new JsoncError('JSONC document is oversized');
  const cleaned = withoutTrailingCommas(withoutComments(text));
  const start = skipWhitespace(cleaned, 0);
  if (cleaned[start] !== '{') throw new JsoncError('Managed JSON root must be an object');
  const members: Record<string, [number, number]> = {};
  const state: ScanState = { nodes: 1 };
  let index = skipWhitespace(cleaned, start + 1);
  if (cleaned[index] === '}') {
    if (skipWhitespace(cleaned, index + 1) !== cleaned.length) throw new JsoncError('Trailing JSON data');
    return { rootStart: start, rootEnd: index, members };
  }
  while (true) {
    if (cleaned[index] !== '"') throw new JsoncError('Object key must be a string');
    const keyEnd = stringEnd(cleaned, index);
    const key = JSON.parse(cleaned.slice(index, keyEnd)) as string;
    if (Object.hasOwn(members, key)) throw new JsoncError(`Duplicate JSON key: ${key}`);
    index = skipWhitespace(cleaned, keyEnd);
    if (cleaned[index] !== ':') throw new JsoncError(`Missing colon after top-level key: ${key}`);
    index = skipWhitespace(cleaned, index + 1);
    const valueStart = index;
    const valueFinish = valueEnd(cleaned, index, state, 1);
    members[key] = [valueStart, valueFinish];
    index = skipWhitespace(cleaned, valueFinish);
    if (cleaned[index] === '}') {
      if (skipWhitespace(cleaned, index + 1) !== cleaned.length) throw new JsoncError('Trailing JSON data');
      return { rootStart: start, rootEnd: index, members };
    }
    if (cleaned[index] !== ',') throw new JsoncError(`Expected comma after top-level key: ${key}`);
    index = skipWhitespace(cleaned, index + 1);
    if (cleaned[index] === '}') {
      if (skipWhitespace(cleaned, index + 1) !== cleaned.length) throw new JsoncError('Trailing JSON data');
      return { rootStart: start, rootEnd: index, members };
    }
  }
}

export function jsoncNewline(text: string): string {
  return text.includes('\r\n') ? '\r\n' : '\n';
}
