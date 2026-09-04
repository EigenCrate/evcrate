'use strict';

const fs = require('node:fs');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { MAX_FILES, MAX_FILE_BYTES, MAX_TOTAL_EXPANDED_BYTES } = require('./path-policy.cjs');

function writeOctal(buf, offset, length, value) {
  const str = value.toString(8).padStart(length - 1, '0');
  buf.write(str, offset, length - 1, 'ascii');
  buf[offset + length - 1] = 0;
}

function calcTarChecksum(header) {
  let sum = 0;
  for (let i = 0; i < 512; i += 1) {
    sum += header[i];
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
  writeOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  header[156] = typeflag.charCodeAt(0);
  header.write('ustar\0', 257, 6, 'ascii');
  header.write('00', 263, 2, 'ascii');
  if (prefix) {
    header.write(prefix, 345, 155, 'utf8');
  }
  const chk = calcTarChecksum(header);
  header.write(chk.toString(8).padStart(6, '0'), 148, 6, 'ascii');
  header[154] = 0;
  header[155] = 0x20;
  return header;
}

function formatPaxRecord(key, value) {
  let len = 3 + Buffer.byteLength(key, 'utf8') + Buffer.byteLength(value, 'utf8');
  let line = `${len} ${key}=${value}\n`;
  while (Buffer.byteLength(line, 'utf8') !== len) {
    len = Buffer.byteLength(line, 'utf8');
    line = `${len} ${key}=${value}\n`;
  }
  return Buffer.from(line, 'utf8');
}

function findUstarSplit(fullPath) {
  let lastSlash = -1;
  while (true) {
    const nextSlash = fullPath.indexOf('/', lastSlash + 1);
    if (nextSlash === -1) break;
    const prefix = fullPath.slice(0, nextSlash);
    const name = fullPath.slice(nextSlash + 1);
    const prefixBytes = Buffer.byteLength(prefix, 'utf8');
    const nameBytes = Buffer.byteLength(name, 'utf8');
    if (prefixBytes > 0 && prefixBytes <= 155 && nameBytes > 0 && nameBytes <= 100) {
      return { prefix, name };
    }
    lastSlash = nextSlash;
  }
  return null;
}

function createTarArchive(records, outputPath) {
  if (records.length > MAX_FILES) {
    throw new Error(`File count ${records.length} exceeds limit ${MAX_FILES}`);
  }

  const chunks = [];
  let totalBytes = 0;
  let paxCounter = 0;

  for (const rec of records) {
    const archivePath = `package/${rec.path}`;
    const data = rec.data || fs.readFileSync(rec.fullPath);

    if (data.length > MAX_FILE_BYTES) {
      throw new Error(`File ${rec.path} size ${data.length} exceeds limit ${MAX_FILE_BYTES}`);
    }
    totalBytes += data.length;
    if (totalBytes > MAX_TOTAL_EXPANDED_BYTES) {
      throw new Error(`Total size exceeds limit ${MAX_TOTAL_EXPANDED_BYTES}`);
    }

    const normMode = (rec.mode & 0o111) !== 0 ? 0o755 : 0o644;
    const totalNameBytes = Buffer.byteLength(archivePath, 'utf8');

    if (totalNameBytes <= 100) {
      chunks.push(createUstarHeader(archivePath, data.length, normMode, '0'));
    } else {
      const split = findUstarSplit(archivePath);
      if (split) {
        chunks.push(createUstarHeader(split.name, data.length, normMode, '0', split.prefix));
      } else {
        paxCounter += 1;
        const paxData = formatPaxRecord('path', archivePath);
        chunks.push(createUstarHeader(`PaxHeaders.0/${paxCounter}`, paxData.length, 0o644, 'x'));
        chunks.push(paxData);
        const paxPad = paxData.length % 512 === 0 ? 0 : 512 - (paxData.length % 512);
        if (paxPad > 0) chunks.push(Buffer.alloc(paxPad, 0));

        chunks.push(createUstarHeader('package/file', data.length, normMode, '0'));
      }
    }

    chunks.push(data);
    const dataPad = data.length % 512 === 0 ? 0 : 512 - (data.length % 512);
    if (dataPad > 0) chunks.push(Buffer.alloc(dataPad, 0));
  }

  chunks.push(Buffer.alloc(1024, 0));
  const tarBuffer = Buffer.concat(chunks);
  const gzipped = zlib.gzipSync(tarBuffer, { level: 9, mtime: 0 });
  fs.writeFileSync(outputPath, gzipped);

  return {
    path: outputPath,
    size: gzipped.length,
    sha256: crypto.createHash('sha256').update(gzipped).digest('hex')
  };
}

module.exports = {
  createTarArchive
};
