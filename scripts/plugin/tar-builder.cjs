'use strict';

/**
 * @file tar-builder.cjs
 * Deterministic USTAR / PAX tar.gz archive writer for plugin packaging (Phase E04).
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');

function writeOctal(buf, offset, length, value) {
  const str = value.toString(8).padStart(length - 1, '0') + '\0';
  buf.write(str, offset, length, 'ascii');
}

function calcTarChecksum(header) {
  let sum = 0;
  for (let i = 0; i < 512; i++) {
    sum += (i >= 148 && i < 156) ? 32 : header[i];
  }
  return sum;
}

function createUstarHeader(name, size, mode, typeflag = '0', prefix = '') {
  const header = Buffer.alloc(512, 0);
  header.write(name, 0, 100, 'utf8');
  writeOctal(header, 100, 8, mode);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, 0); // mtime = 0
  header[156] = typeflag.charCodeAt(0);
  header.write('ustar\0', 257, 6, 'ascii');
  header.write('00', 263, 2, 'ascii');
  header.write('root', 265, 32, 'utf8');
  header.write('root', 297, 32, 'utf8');
  if (prefix) header.write(prefix, 345, 155, 'utf8');
  const chk = calcTarChecksum(header);
  const chkStr = chk.toString(8).padStart(6, '0') + '\0 ';
  header.write(chkStr, 148, 8, 'ascii');
  return header;
}

function formatPaxRecord(key, value) {
  let len = 1 + key.length + 1 + Buffer.byteLength(value, 'utf8') + 1;
  while (true) {
    const full = `${len} ${key}=${value}\n`;
    const actual = Buffer.byteLength(full, 'utf8');
    if (actual === len) return Buffer.from(full, 'utf8');
    len = actual;
  }
}

function findUstarSplit(fullPath) {
  if (Buffer.byteLength(fullPath, 'utf8') <= 100) {
    return { prefix: '', name: fullPath };
  }
  const parts = fullPath.split('/');
  for (let i = parts.length - 1; i >= 1; i--) {
    const prefix = parts.slice(0, i).join('/');
    const name = parts.slice(i).join('/');
    if (Buffer.byteLength(prefix, 'utf8') <= 155 && Buffer.byteLength(name, 'utf8') <= 100) {
      return { prefix, name };
    }
  }
  return null;
}

function createDeterministicTarArchive(records, outputPath) {
  const chunks = [];
  for (const r of records) {
    const filePath = r.path;
    const data = r.data;
    const mode = r.mode || 0o644;
    const split = findUstarSplit(filePath);
    if (!split) {
      const paxData = formatPaxRecord('path', filePath);
      const paxHeader = createUstarHeader('PaxHeader/' + path.basename(filePath), paxData.length, 0o644, 'x', '');
      chunks.push(paxHeader);
      chunks.push(paxData);
      const paxPad = paxData.length % 512 === 0 ? 0 : 512 - (paxData.length % 512);
      if (paxPad > 0) chunks.push(Buffer.alloc(paxPad, 0));
      const bodyHeader = createUstarHeader(filePath.slice(0, 100), data.length, mode, '0', '');
      chunks.push(bodyHeader);
    } else {
      const header = createUstarHeader(split.name, data.length, mode, '0', split.prefix);
      chunks.push(header);
    }
    chunks.push(data);
    const pad = data.length % 512 === 0 ? 0 : 512 - (data.length % 512);
    if (pad > 0) chunks.push(Buffer.alloc(pad, 0));
  }
  chunks.push(Buffer.alloc(1024, 0)); // 2 zero blocks EOF
  const tarBuf = Buffer.concat(chunks);
  const gzBuf = zlib.gzipSync(tarBuf, { mtime: 0, level: 9 });
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outputPath, gzBuf);
  const sha256 = crypto.createHash('sha256').update(gzBuf).digest('hex');
  return { path: outputPath, size: gzBuf.length, sha256 };
}

module.exports = {
  createDeterministicTarArchive
};
