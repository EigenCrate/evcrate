'use strict';

const fs = require('node:fs');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const {
  MAX_ARCHIVE_BYTES,
  MAX_TOTAL_EXPANDED_BYTES,
  validateInventoryPath
} = require('./path-policy.cjs');
const { calcCrc32 } = require('./zip-writer.cjs');
const { parseZipEocd } = require('./zip-eocd.cjs');

const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });

function decodeUtf8(buf) {
  try {
    return UTF8_DECODER.decode(buf);
  } catch {
    throw new Error('ZIP entry name is not valid UTF-8');
  }
}

function verifyZipArchive(archivePath, expectedRecords, options = {}) {
  const stat = fs.statSync(archivePath);
  if (stat.size > MAX_ARCHIVE_BYTES) {
    throw new Error(`ZIP size ${stat.size} exceeds maximum ${MAX_ARCHIVE_BYTES}`);
  }

  const buf = fs.readFileSync(archivePath);
  const { recordCount, cdSize, cdOffset } = parseZipEocd(buf);

  if (recordCount !== expectedRecords.length) {
    throw new Error(`ZIP record count ${recordCount} does not match expected ${expectedRecords.length}`);
  }

  let offset = cdOffset;
  let expectedLocalOffset = 0;
  let totalExpanded = 0;

  for (let i = 0; i < recordCount; i += 1) {
    if (offset + 46 > cdOffset + cdSize) {
      throw new Error(`Central directory entry ${i} overflows central directory boundary`);
    }
    if (buf.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error(`Invalid Central Directory signature at offset ${offset}`);
    }

    const flags = buf.readUInt16LE(offset + 8);
    const method = buf.readUInt16LE(offset + 10);
    const crc = buf.readUInt32LE(offset + 16);
    const compSize = buf.readUInt32LE(offset + 20);
    const uncompSize = buf.readUInt32LE(offset + 24);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const diskNum = buf.readUInt16LE(offset + 34);
    const localOffset = buf.readUInt32LE(offset + 42);

    if (flags !== 0x0800) {
      throw new Error(`Central entry at index ${i} has unexpected flags: 0x${flags.toString(16)} (expected 0x0800)`);
    }
    if (method !== 8) {
      throw new Error(`Central entry at index ${i} uses unsupported compression method ${method}`);
    }
    if (extraLen !== 0 || commentLen !== 0 || diskNum !== 0) {
      throw new Error(`Central entry at index ${i} has forbidden extra, comment, or disk`);
    }
    if (localOffset !== expectedLocalOffset) {
      throw new Error(`Non-contiguous local record: expected offset ${expectedLocalOffset}, got ${localOffset}`);
    }

    const name = decodeUtf8(buf.subarray(offset + 46, offset + 46 + nameLen));
    offset += 46 + nameLen;

    if (!name.startsWith('package/')) {
      throw new Error(`ZIP entry does not start with package/: ${name}`);
    }

    const packageRelative = name.slice('package/'.length);
    validateInventoryPath(packageRelative, options);

    const expected = expectedRecords[i];
    if (packageRelative !== expected.path) {
      throw new Error(`ZIP order/duplicate mismatch at #${i}: got "${packageRelative}", expected "${expected.path}"`);
    }

    // Cross-check local header
    if (localOffset + 30 > cdOffset) {
      throw new Error(`Local header for ${name} overflows central directory`);
    }
    if (buf.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error(`Invalid local header signature for ${name}`);
    }
    if (buf.readUInt16LE(localOffset + 6) !== 0x0800 || buf.readUInt16LE(localOffset + 8) !== 8) {
      throw new Error(`Local header for ${name} flags/method mismatch`);
    }
    if (buf.readUInt32LE(localOffset + 14) !== crc) {
      throw new Error(`CRC32 mismatch between central and local header for ${name}`);
    }
    if (buf.readUInt32LE(localOffset + 18) !== compSize || buf.readUInt32LE(localOffset + 22) !== uncompSize) {
      throw new Error(`Size mismatch between central and local header for ${name}`);
    }

    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    if (localExtraLen !== 0) {
      throw new Error(`Local header for ${name} contains forbidden extra field`);
    }

    const localName = decodeUtf8(buf.subarray(localOffset + 30, localOffset + 30 + localNameLen));
    if (localName !== name) {
      throw new Error(`Name mismatch between central ("${name}") and local ("${localName}")`);
    }

    const dataOffset = localOffset + 30 + localNameLen;
    if (dataOffset + compSize > cdOffset) {
      throw new Error(`Local data payload for ${name} overflows central directory`);
    }

    totalExpanded += uncompSize;
    if (totalExpanded > MAX_TOTAL_EXPANDED_BYTES) {
      throw new Error(`Total decompressed ZIP bytes exceed limit ${MAX_TOTAL_EXPANDED_BYTES}`);
    }

    const compData = buf.subarray(dataOffset, dataOffset + compSize);
    const uncompressed = zlib.inflateRawSync(compData, { maxOutputLength: Math.max(1, uncompSize) });

    if (uncompressed.length !== uncompSize || calcCrc32(uncompressed) !== crc) {
      throw new Error(`Decompressed data or CRC32 validation failed for ${name}`);
    }

    const sha256 = crypto.createHash('sha256').update(uncompressed).digest('hex');
    if (sha256 !== expected.sha256 || uncompressed.length !== expected.size) {
      throw new Error(`Record verification failed for ${name}`);
    }

    expectedLocalOffset = dataOffset + compSize;
  }

  if (expectedLocalOffset !== cdOffset) {
    throw new Error(`Local records do not end at central directory start: ${expectedLocalOffset} vs ${cdOffset}`);
  }
  if (offset !== cdOffset + cdSize) {
    throw new Error(`Central directory bytes not exactly exhausted: offset ${offset} vs ${cdOffset + cdSize}`);
  }

  return true;
}

module.exports = {
  verifyZipArchive
};
