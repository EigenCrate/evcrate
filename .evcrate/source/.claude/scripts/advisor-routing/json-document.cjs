'use strict';

const { TextDecoder } = require('node:util');
const { createRoutingError } = require('./errors.cjs');

const MAX_JSON_DEPTH = 32;

function fail(code) {
  throw createRoutingError(code);
}

class JsonScanner {
  constructor(text) {
    this.text = text;
    this.index = 0;
    this.depth = 0;
  }

  skipWhitespace() {
    while (/\s/u.test(this.text[this.index] || '')) this.index += 1;
  }

  parseString() {
    const start = this.index;
    this.index += 1;
    while (this.index < this.text.length) {
      const character = this.text[this.index++];
      if (character === '"') {
        try { return JSON.parse(this.text.slice(start, this.index)); } catch { fail('ROUTE_POLICY_MALFORMED'); }
      }
      if (character === '\\') this.index += 1;
      else if (character < ' ') fail('ROUTE_POLICY_MALFORMED');
    }
    fail('ROUTE_POLICY_MALFORMED');
  }

  parseObject() {
    this.index += 1;
    this.depth += 1;
    if (this.depth > MAX_JSON_DEPTH) fail('ROUTE_SCHEMA_INVALID');
    const keys = new Set();
    this.skipWhitespace();
    if (this.text[this.index] === '}') { this.index += 1; this.depth -= 1; return; }
    for (;;) {
      this.skipWhitespace();
      if (this.text[this.index] !== '"') fail('ROUTE_POLICY_MALFORMED');
      const key = this.parseString();
      if (keys.has(key)) fail('ROUTE_DUPLICATE_KEY');
      keys.add(key);
      this.skipWhitespace();
      if (this.text[this.index++] !== ':') fail('ROUTE_POLICY_MALFORMED');
      this.parseValue();
      this.skipWhitespace();
      const delimiter = this.text[this.index++];
      if (delimiter === '}') break;
      if (delimiter !== ',') fail('ROUTE_POLICY_MALFORMED');
    }
    this.depth -= 1;
  }

  parseArray() {
    this.index += 1;
    this.depth += 1;
    if (this.depth > MAX_JSON_DEPTH) fail('ROUTE_SCHEMA_INVALID');
    this.skipWhitespace();
    if (this.text[this.index] === ']') { this.index += 1; this.depth -= 1; return; }
    for (;;) {
      this.parseValue();
      this.skipWhitespace();
      const delimiter = this.text[this.index++];
      if (delimiter === ']') break;
      if (delimiter !== ',') fail('ROUTE_POLICY_MALFORMED');
    }
    this.depth -= 1;
  }

  parseValue() {
    this.skipWhitespace();
    const character = this.text[this.index];
    if (character === '"') return this.parseString();
    if (character === '{') return this.parseObject();
    if (character === '[') return this.parseArray();
    if (/[-0-9]/u.test(character || '')) {
      const match = this.text.slice(this.index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u);
      if (!match) fail('ROUTE_POLICY_MALFORMED');
      this.index += match[0].length;
      return;
    }
    for (const literal of ['true', 'false', 'null']) {
      if (this.text.startsWith(literal, this.index)) { this.index += literal.length; return; }
    }
    fail('ROUTE_POLICY_MALFORMED');
  }

  parseDocument() {
    this.parseValue();
    this.skipWhitespace();
    if (this.index !== this.text.length) fail('ROUTE_POLICY_MALFORMED');
  }
}

function decodeUtf8(value) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(value); }
  catch { fail('ROUTE_POLICY_MALFORMED'); }
}

function parseJsonDocument(text) {
  if (typeof text !== 'string') fail('ROUTE_POLICY_MALFORMED');
  new JsonScanner(text).parseDocument();
  try { return JSON.parse(text); } catch { fail('ROUTE_POLICY_MALFORMED'); }
}

module.exports = { decodeUtf8, parseJsonDocument };
