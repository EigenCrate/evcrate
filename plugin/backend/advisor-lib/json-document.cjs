'use strict';

const { TextDecoder } = require('node:util');
const { createRoutingError } = require('./errors.cjs');

const MAX_JSON_DEPTH = 32;

function fail(code) {
  throw createRoutingError(code);
}

class JsonScanner {
  constructor(text, errorCode, duplicateCode) {
    this.text = text;
    this.errorCode = errorCode;
    this.duplicateCode = duplicateCode;
    this.index = 0;
    this.depth = 0;
  }

  bad() { fail(this.errorCode); }

  skipWhitespace() {
    while (/\s/u.test(this.text[this.index] || '')) this.index += 1;
  }

  parseString() {
    const start = this.index++;
    while (this.index < this.text.length) {
      const character = this.text[this.index++];
      if (character === '"') {
        try { return JSON.parse(this.text.slice(start, this.index)); } catch { this.bad(); }
      }
      if (character === '\\') this.index += 1;
      else if (character < ' ') this.bad();
    }
    this.bad();
  }

  enter() {
    this.depth += 1;
    if (this.depth > MAX_JSON_DEPTH) fail(this.errorCode);
  }

  leave() { this.depth -= 1; }

  parseObject() {
    this.index += 1;
    this.enter();
    const keys = new Set();
    this.skipWhitespace();
    if (this.text[this.index] === '}') { this.index += 1; this.leave(); return; }
    for (;;) {
      this.skipWhitespace();
      if (this.text[this.index] !== '"') this.bad();
      const key = this.parseString();
      if (keys.has(key)) fail(this.duplicateCode);
      keys.add(key);
      this.skipWhitespace();
      if (this.text[this.index++] !== ':') this.bad();
      this.parseValue();
      this.skipWhitespace();
      const delimiter = this.text[this.index++];
      if (delimiter === '}') break;
      if (delimiter !== ',') this.bad();
    }
    this.leave();
  }

  parseArray() {
    this.index += 1;
    this.enter();
    this.skipWhitespace();
    if (this.text[this.index] === ']') { this.index += 1; this.leave(); return; }
    for (;;) {
      this.parseValue();
      this.skipWhitespace();
      const delimiter = this.text[this.index++];
      if (delimiter === ']') break;
      if (delimiter !== ',') this.bad();
    }
    this.leave();
  }

  parseValue() {
    this.skipWhitespace();
    const character = this.text[this.index];
    if (character === '"') return this.parseString();
    if (character === '{') return this.parseObject();
    if (character === '[') return this.parseArray();
    if (/[-0-9]/u.test(character || '')) {
      const match = this.text.slice(this.index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u);
      if (!match) this.bad();
      this.index += match[0].length;
      return;
    }
    for (const literal of ['true', 'false', 'null']) {
      if (this.text.startsWith(literal, this.index)) { this.index += literal.length; return; }
    }
    this.bad();
  }

  parseDocument() {
    this.parseValue();
    this.skipWhitespace();
    if (this.index !== this.text.length) this.bad();
  }
}

function decodeUtf8(value, errorCode = 'ROUTE_POLICY_MALFORMED') {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(value); }
  catch { fail(errorCode); }
}

function parseJsonDocument(
  text,
  errorCode = 'ROUTE_POLICY_MALFORMED',
  duplicateCode = 'ROUTE_DUPLICATE_KEY'
) {
  if (typeof text !== 'string') fail(errorCode);
  new JsonScanner(text, errorCode, duplicateCode).parseDocument();
  try { return JSON.parse(text); } catch { fail(errorCode); }
}

module.exports = { decodeUtf8, parseJsonDocument };
