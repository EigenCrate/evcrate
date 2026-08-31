import { MAX_JSON_DEPTH, assertJsonText, rememberParsedNumbers, type NumberToken } from './canonical-json.js';
export { canonicalBytes, canonicalJson, MAX_JSON_DEPTH } from './canonical-json.js';
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export const MAX_JSON_BYTES = 64 * 1024;

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

export function decodeUtf8(input: Uint8Array | ArrayBuffer, maxBytes = MAX_JSON_BYTES): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength > maxBytes) throw new RangeError('UTF-8 input is oversized');
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new SyntaxError('UTF-8 input is invalid');
  }
}

class JsonReader {
  private readonly text: string;
  private readonly numbers = new Map<string, NumberToken>();
  private offset = 0;
  constructor(text: string) { this.text = text; }
  parse(): JsonValue {
    this.skipWhitespace();
    const value = this.value(0, []);
    this.skipWhitespace();
    if (this.offset !== this.text.length) throw new SyntaxError('Trailing JSON data');
    if (value === null || typeof value !== 'object') throw new SyntaxError('JSON document root must be an object or array');
    rememberParsedNumbers(value, this.numbers);
    return value;
  }
  private value(depth: number, path: readonly (string | number)[]): JsonValue {
    if (depth > MAX_JSON_DEPTH) throw new RangeError('JSON nesting is too deep');
    const char = this.text[this.offset];
    if (char === '{') return this.object(depth + 1, path);
    if (char === '[') return this.array(depth + 1, path);
    if (char === '"') return this.string();
    if (this.text.startsWith('true', this.offset)) { this.offset += 4; return true; }
    if (this.text.startsWith('false', this.offset)) { this.offset += 5; return false; }
    if (this.text.startsWith('null', this.offset)) { this.offset += 4; return null; }
    return this.number(path);
  }
  private object(depth: number, path: readonly (string | number)[]): { [key: string]: JsonValue } {
    this.offset++;
    const output: { [key: string]: JsonValue } = {};
    const keys = new Set<string>();
    this.skipWhitespace();
    if (this.text[this.offset] === '}') { this.offset++; return output; }
    while (true) {
      this.skipWhitespace();
      if (this.text[this.offset] !== '"') throw new SyntaxError('Object key must be a string');
      const key = this.string();
      if (keys.has(key)) throw new SyntaxError('Duplicate JSON object key');
      keys.add(key);
      this.skipWhitespace();
      if (this.text[this.offset++] !== ':') throw new SyntaxError('Object key has no value');
      this.skipWhitespace();
      const value = this.value(depth, [...path, key]);
      Object.defineProperty(output, key, {
        value, enumerable: true, writable: true, configurable: true
      });
      this.skipWhitespace();
      const delimiter = this.text[this.offset++];
      if (delimiter === '}') return output;
      if (delimiter !== ',') throw new SyntaxError('Object separator is invalid');
    }
  }
  private array(depth: number, path: readonly (string | number)[]): JsonValue[] {
    this.offset++;
    const output: JsonValue[] = [];
    this.skipWhitespace();
    if (this.text[this.offset] === ']') { this.offset++; return output; }
    while (true) {
      this.skipWhitespace();
      output.push(this.value(depth, [...path, output.length]));
      this.skipWhitespace();
      const delimiter = this.text[this.offset++];
      if (delimiter === ']') return output;
      if (delimiter !== ',') throw new SyntaxError('Array separator is invalid');
    }
  }
  private string(): string {
    const start = this.offset;
    this.offset++;
    let escaped = false;
    while (this.offset < this.text.length) {
      const char = this.text[this.offset++];
      if (escaped) { escaped = false; continue; }
      if (char === '\\') { escaped = true; continue; }
      if (char === '"') {
        const value = JSON.parse(this.text.slice(start, this.offset)) as string;
        try { assertJsonText(value); } catch (error) {
          if (error instanceof TypeError) throw new SyntaxError(error.message);
          throw error;
        }
        return value;
      }
      if (char < ' ') throw new SyntaxError('JSON string contains a control character');
    }
    throw new SyntaxError('Unterminated JSON string');
  }
  private number(path: readonly (string | number)[]): number {
    const match = this.text.slice(this.offset).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u);
    if (!match) throw new SyntaxError('JSON value is invalid');
    this.offset += match[0].length;
    const result = Number(match[0]);
    if (!Number.isFinite(result)) throw new RangeError('JSON number is not finite');
    this.numbers.set(JSON.stringify(path), { floating: /[.eE]/u.test(match[0]), raw: match[0] });
    return result;
  }
  private skipWhitespace(): void {
    while (this.text[this.offset] === ' ' || this.text[this.offset] === '\t'
      || this.text[this.offset] === '\n' || this.text[this.offset] === '\r') this.offset++;
  }
}

/** Parse a bounded JSON document whose root is an object or array. */
export function parseJsonDocument(input: Uint8Array | ArrayBuffer | string, maxBytes = MAX_JSON_BYTES): JsonValue {
  const text = typeof input === 'string' ? input : decodeUtf8(input, maxBytes);
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new RangeError('JSON input is oversized');
  return new JsonReader(text).parse();
}

