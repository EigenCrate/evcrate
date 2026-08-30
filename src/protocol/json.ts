export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export const MAX_JSON_BYTES = 64 * 1024;
export const MAX_JSON_DEPTH = 16;
const CONTROL = /[\u0000-\u001f\u007f]/u;

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
  private offset = 0;
  constructor(text: string) { this.text = text; }
  parse(): JsonValue {
    this.skipWhitespace();
    const value = this.value(0);
    this.skipWhitespace();
    if (this.offset !== this.text.length) throw new SyntaxError('Trailing JSON data');
    return value;
  }
  private value(depth: number): JsonValue {
    if (depth > MAX_JSON_DEPTH) throw new RangeError('JSON nesting is too deep');
    const char = this.text[this.offset];
    if (char === '{') return this.object(depth + 1);
    if (char === '[') return this.array(depth + 1);
    if (char === '"') return this.string();
    if (this.text.startsWith('true', this.offset)) { this.offset += 4; return true; }
    if (this.text.startsWith('false', this.offset)) { this.offset += 5; return false; }
    if (this.text.startsWith('null', this.offset)) { this.offset += 4; return null; }
    return this.number();
  }
  private object(depth: number): { [key: string]: JsonValue } {
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
      const value = this.value(depth);
      Object.defineProperty(output, key, {
        value, enumerable: true, writable: true, configurable: true
      });
      this.skipWhitespace();
      const delimiter = this.text[this.offset++];
      if (delimiter === '}') return output;
      if (delimiter !== ',') throw new SyntaxError('Object separator is invalid');
    }
  }
  private array(depth: number): JsonValue[] {
    this.offset++;
    const output: JsonValue[] = [];
    this.skipWhitespace();
    if (this.text[this.offset] === ']') { this.offset++; return output; }
    while (true) {
      this.skipWhitespace();
      output.push(this.value(depth));
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
        if (CONTROL.test(value)) throw new SyntaxError('JSON string contains a control character');
        return value;
      }
      if (char < ' ') throw new SyntaxError('JSON string contains a control character');
    }
    throw new SyntaxError('Unterminated JSON string');
  }
  private number(): number {
    const match = this.text.slice(this.offset).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u);
    if (!match) throw new SyntaxError('JSON value is invalid');
    this.offset += match[0].length;
    const result = Number(match[0]);
    if (!Number.isFinite(result)) throw new RangeError('JSON number is not finite');
    return result;
  }
  private skipWhitespace(): void {
    while (this.text[this.offset] === ' ' || this.text[this.offset] === '\t'
      || this.text[this.offset] === '\n' || this.text[this.offset] === '\r') this.offset++;
  }
}

export function parseJsonDocument(input: Uint8Array | ArrayBuffer | string, maxBytes = MAX_JSON_BYTES): JsonValue {
  const text = typeof input === 'string' ? input : decodeUtf8(input, maxBytes);
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new RangeError('JSON input is oversized');
  return new JsonReader(text).parse();
}

function canonical(value: unknown, depth: number): string {
  if (value === undefined) return '';
  if (depth > MAX_JSON_DEPTH) throw new RangeError('JSON nesting is too deep');
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') {
    if (CONTROL.test(value)) throw new TypeError('JSON string contains a control character');
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('JSON number is not finite');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((child) => canonical(child, depth + 1) || 'null').join(',')}]`;
  if (!isPlainObject(value)) throw new TypeError('JSON value must be plain');
  return `{${Object.keys(value).sort().flatMap((key) => {
    if (CONTROL.test(key)) throw new TypeError('JSON object key contains a control character');
    const encoded = canonical(value[key], depth + 1);
    return encoded ? [`${JSON.stringify(key)}:${encoded}`] : [];
  }).join(',')}}`;
}

export function canonicalJson(value: unknown): string { return canonical(value, 0); }
export function canonicalBytes(value: unknown): Uint8Array { return new TextEncoder().encode(canonicalJson(value)); }
