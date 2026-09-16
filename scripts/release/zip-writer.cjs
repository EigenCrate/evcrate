'use strict';

const fs = require('node:fs');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { MAX_FILES, MAX_FILE_BYTES, MAX_TOTAL_EXPANDED_BYTES } = require('./path-policy.cjs');

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i += 1) {
  let c = i;
  for (let k = 0; k < 8; k += 1) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[i] = c >>> 0;
}

function calcCrc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i += 1) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function createZipArchive(records, outputPath) {
  if (records.length > MAX_FILES) {
    throw new Error(`File count ${records.length} exceeds limit ${MAX_FILES}`);
  }

  const localChunks = [];
  const cdChunks = [];
  let currentOffset = 0;
  let totalBytes = 0;

  for (const rec of records) {
    const archivePath = `package/${rec.path}`;
    const nameBuf = Buffer.from(archivePath, 'utf8');
    const data = rec.data || fs.readFileSync(rec.fullPath);

    if (data.length > MAX_FILE_BYTES) {
      throw new Error(`File ${rec.path} size ${data.length} exceeds limit ${MAX_FILE_BYTES}`);
    }
    totalBytes += data.length;
    if (totalBytes > MAX_TOTAL_EXPANDED_BYTES) {
      throw new Error(`Total size exceeds limit ${MAX_TOTAL_EXPANDED_BYTES}`);
    }

    const compressed = zlib.deflateRawSync(data, { level: 9 });
    const crc = calcCrc32(data);

    // Local Header
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0x0021, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localChunks.push(localHeader, nameBuf, compressed);

    // Central Directory Header
    const cdHeader = Buffer.alloc(46);
    cdHeader.writeUInt32LE(0x02014b50, 0);
    cdHeader.writeUInt16LE(0x0314, 4); // UNIX (0x03), PKZIP 2.0 (0x14)
    cdHeader.writeUInt16LE(20, 6);
    cdHeader.writeUInt16LE(0x0800, 8);
    cdHeader.writeUInt16LE(8, 10);
    cdHeader.writeUInt16LE(0, 12);
    cdHeader.writeUInt16LE(0x0021, 14);
    cdHeader.writeUInt32LE(crc, 16);
    cdHeader.writeUInt32LE(compressed.length, 20);
    cdHeader.writeUInt32LE(data.length, 24);
    cdHeader.writeUInt16LE(nameBuf.length, 28);
    cdHeader.writeUInt16LE(0, 30);
    cdHeader.writeUInt16LE(0, 32);
    cdHeader.writeUInt16LE(0, 34);
    cdHeader.writeUInt16LE(0, 36);
    const posixMode = (0o100000 | (rec.mode & 0o777)) >>> 0;
    cdHeader.writeUInt32LE((posixMode << 16) >>> 0, 38);
    cdHeader.writeUInt32LE(currentOffset, 42);

    cdChunks.push(cdHeader, nameBuf);

    currentOffset += 30 + nameBuf.length + compressed.length;
  }

  const cdOffset = currentOffset;
  const cdBuffer = Buffer.concat(cdChunks);
  const isZip64 = records.length >= 0xFFFF;
  const trailingChunks = [cdBuffer];

  if (isZip64) {
    const zip64EocdOffset = cdOffset + cdBuffer.length;
    // ZIP64 End of Central Directory Record (56 bytes)
    const z64Eocd = Buffer.alloc(56);
    z64Eocd.writeUInt32LE(0x06064b50, 0);
    z64Eocd.writeBigUInt64LE(44n, 4);
    z64Eocd.writeUInt16LE(45, 12);
    z64Eocd.writeUInt16LE(45, 14);
    z64Eocd.writeUInt32LE(0, 16);
    z64Eocd.writeUInt32LE(0, 20);
    z64Eocd.writeBigUInt64LE(BigInt(records.length), 24);
    z64Eocd.writeBigUInt64LE(BigInt(records.length), 32);
    z64Eocd.writeBigUInt64LE(BigInt(cdBuffer.length), 40);
    z64Eocd.writeBigUInt64LE(BigInt(cdOffset), 48);
    trailingChunks.push(z64Eocd);

    // ZIP64 End of Central Directory Locator (20 bytes)
    const z64Locator = Buffer.alloc(20);
    z64Locator.writeUInt32LE(0x07064b50, 0);
    z64Locator.writeUInt32LE(0, 4);
    z64Locator.writeBigUInt64LE(BigInt(zip64EocdOffset), 8);
    z64Locator.writeUInt32LE(1, 16);
    trailingChunks.push(z64Locator);
  }

  // Classic EOCD
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(isZip64 ? 0xFFFF : records.length, 8);
  eocd.writeUInt16LE(isZip64 ? 0xFFFF : records.length, 10);
  eocd.writeUInt32LE(cdBuffer.length, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  eocd.writeUInt16LE(0, 20);
  trailingChunks.push(eocd);

  const fullArchive = Buffer.concat([...localChunks, ...trailingChunks]);
  fs.writeFileSync(outputPath, fullArchive);

  return {
    path: outputPath,
    size: fullArchive.length,
    sha256: crypto.createHash('sha256').update(fullArchive).digest('hex')
  };
}

module.exports = {
  calcCrc32,
  createZipArchive
};
