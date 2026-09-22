"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_JSON_BYTES = exports.MAX_JSON_DEPTH = exports.canonicalJson = exports.canonicalBytes = void 0;
exports.isPlainObject = isPlainObject;
exports.decodeUtf8 = decodeUtf8;
exports.parseJsonDocument = parseJsonDocument;
const canonical_json_js_1 = require("./canonical-json.js");
var canonical_json_js_2 = require("./canonical-json.js");
Object.defineProperty(exports, "canonicalBytes", { enumerable: true, get: function () { return canonical_json_js_2.canonicalBytes; } });
Object.defineProperty(exports, "canonicalJson", { enumerable: true, get: function () { return canonical_json_js_2.canonicalJson; } });
Object.defineProperty(exports, "MAX_JSON_DEPTH", { enumerable: true, get: function () { return canonical_json_js_2.MAX_JSON_DEPTH; } });
exports.MAX_JSON_BYTES = 64 * 1024;
function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        && Object.getPrototypeOf(value) === Object.prototype;
}
function decodeUtf8(input, maxBytes = exports.MAX_JSON_BYTES) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (bytes.byteLength > maxBytes)
        throw new RangeError('UTF-8 input is oversized');
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    }
    catch {
        throw new SyntaxError('UTF-8 input is invalid');
    }
}
class JsonReader {
    constructor(text) {
        this.numbers = new Map();
        this.offset = 0;
        this.text = text;
    }
    parse() {
        this.skipWhitespace();
        const value = this.value(0, []);
        this.skipWhitespace();
        if (this.offset !== this.text.length)
            throw new SyntaxError('Trailing JSON data');
        if (value === null || typeof value !== 'object')
            throw new SyntaxError('JSON document root must be an object or array');
        (0, canonical_json_js_1.rememberParsedNumbers)(value, this.numbers);
        return value;
    }
    value(depth, path) {
        if (depth > canonical_json_js_1.MAX_JSON_DEPTH)
            throw new RangeError('JSON nesting is too deep');
        const char = this.text[this.offset];
        if (char === '{')
            return this.object(depth + 1, path);
        if (char === '[')
            return this.array(depth + 1, path);
        if (char === '"')
            return this.string();
        if (this.text.startsWith('true', this.offset)) {
            this.offset += 4;
            return true;
        }
        if (this.text.startsWith('false', this.offset)) {
            this.offset += 5;
            return false;
        }
        if (this.text.startsWith('null', this.offset)) {
            this.offset += 4;
            return null;
        }
        return this.number(path);
    }
    object(depth, path) {
        this.offset++;
        const output = {};
        const keys = new Set();
        this.skipWhitespace();
        if (this.text[this.offset] === '}') {
            this.offset++;
            return output;
        }
        while (true) {
            this.skipWhitespace();
            if (this.text[this.offset] !== '"')
                throw new SyntaxError('Object key must be a string');
            const key = this.string();
            if (keys.has(key))
                throw new SyntaxError('Duplicate JSON object key');
            keys.add(key);
            this.skipWhitespace();
            if (this.text[this.offset++] !== ':')
                throw new SyntaxError('Object key has no value');
            this.skipWhitespace();
            const value = this.value(depth, [...path, key]);
            Object.defineProperty(output, key, {
                value, enumerable: true, writable: true, configurable: true
            });
            this.skipWhitespace();
            const delimiter = this.text[this.offset++];
            if (delimiter === '}')
                return output;
            if (delimiter !== ',')
                throw new SyntaxError('Object separator is invalid');
        }
    }
    array(depth, path) {
        this.offset++;
        const output = [];
        this.skipWhitespace();
        if (this.text[this.offset] === ']') {
            this.offset++;
            return output;
        }
        while (true) {
            this.skipWhitespace();
            output.push(this.value(depth, [...path, output.length]));
            this.skipWhitespace();
            const delimiter = this.text[this.offset++];
            if (delimiter === ']')
                return output;
            if (delimiter !== ',')
                throw new SyntaxError('Array separator is invalid');
        }
    }
    string() {
        const start = this.offset;
        this.offset++;
        let escaped = false;
        while (this.offset < this.text.length) {
            const char = this.text[this.offset++];
            if (escaped) {
                escaped = false;
                continue;
            }
            if (char === '\\') {
                escaped = true;
                continue;
            }
            if (char === '"') {
                const value = JSON.parse(this.text.slice(start, this.offset));
                try {
                    (0, canonical_json_js_1.assertJsonText)(value);
                }
                catch (error) {
                    if (error instanceof TypeError)
                        throw new SyntaxError(error.message);
                    throw error;
                }
                return value;
            }
            if (char < ' ')
                throw new SyntaxError('JSON string contains a control character');
        }
        throw new SyntaxError('Unterminated JSON string');
    }
    number(path) {
        const match = this.text.slice(this.offset).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u);
        if (!match)
            throw new SyntaxError('JSON value is invalid');
        this.offset += match[0].length;
        const result = Number(match[0]);
        if (!Number.isFinite(result))
            throw new RangeError('JSON number is not finite');
        this.numbers.set(JSON.stringify(path), { floating: /[.eE]/u.test(match[0]), raw: match[0] });
        return result;
    }
    skipWhitespace() {
        while (this.text[this.offset] === ' ' || this.text[this.offset] === '\t'
            || this.text[this.offset] === '\n' || this.text[this.offset] === '\r')
            this.offset++;
    }
}
/** Parse a bounded JSON document whose root is an object or array. */
function parseJsonDocument(input, maxBytes = exports.MAX_JSON_BYTES) {
    const text = typeof input === 'string' ? input : decodeUtf8(input, maxBytes);
    if (new TextEncoder().encode(text).byteLength > maxBytes)
        throw new RangeError('JSON input is oversized');
    return new JsonReader(text).parse();
}
