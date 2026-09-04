'use strict';

const crypto = require('node:crypto');

const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/u;

function compareCodePoints(a, b) {
  const codePointsA = Array.from(a, (char) => char.codePointAt(0));
  const codePointsB = Array.from(b, (char) => char.codePointAt(0));
  const minLength = Math.min(codePointsA.length, codePointsB.length);
  for (let i = 0; i < minLength; i += 1) {
    if (codePointsA[i] !== codePointsB[i]) {
      return codePointsA[i] - codePointsB[i];
    }
  }
  return codePointsA.length - codePointsB.length;
}

function canonicalJson(value, depth = 0) {
  if (depth > 32) {
    throw new RangeError('JSON nesting too deep');
  }
  if (value === null || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'string') {
    if (CONTROL_CHARS.test(value)) {
      throw new TypeError('JSON string contains control character');
    }
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('JSON number is not finite');
    }
    return value.toString();
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item, depth + 1)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort(compareCodePoints);
    const entries = keys.map((key) => {
      if (CONTROL_CHARS.test(key)) {
        throw new TypeError('JSON object key contains control character');
      }
      return `${JSON.stringify(key)}:${canonicalJson(value[key], depth + 1)}`;
    });
    return `{${entries.join(',')}}`;
  }
  throw new TypeError(`Cannot canonically encode type: ${typeof value}`);
}

function canonicalJsonBytes(value) {
  return Buffer.from(`${canonicalJson(value)}\n`, 'utf8');
}

function sha256Bytes(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function sha256Canonical(value) {
  return sha256Bytes(canonicalJsonBytes(value));
}

module.exports = {
  compareCodePoints,
  canonicalJson,
  canonicalJsonBytes,
  sha256Bytes,
  sha256Canonical
};
