'use strict';

function parseZipEocd(buf) {
  const eocdOffset = buf.length - 22;

  if (eocdOffset < 0 || buf.readUInt32LE(eocdOffset) !== 0x06054b50) {
    throw new Error('EOCD not found at exact end of ZIP archive');
  }
  if (buf.readUInt16LE(eocdOffset + 4) !== 0 || buf.readUInt16LE(eocdOffset + 6) !== 0) {
    throw new Error('Multi-disk ZIP archives are forbidden');
  }
  if (buf.readUInt16LE(eocdOffset + 20) !== 0) {
    throw new Error('ZIP archive contains non-zero comment or trailing data');
  }

  const isZip64 = buf.readUInt16LE(eocdOffset + 10) === 0xFFFF;
  let recordCount, cdSize, cdOffset;

  if (isZip64) {
    const locatorOffset = eocdOffset - 20;
    if (locatorOffset < 0 || buf.readUInt32LE(locatorOffset) !== 0x07064b50) {
      throw new Error('ZIP64 locator missing or invalid');
    }
    if (buf.readUInt32LE(locatorOffset + 4) !== 0 || buf.readUInt32LE(locatorOffset + 16) !== 1) {
      throw new Error('Multi-disk ZIP64 locator is forbidden');
    }
    const z64EocdOffset = Number(buf.readBigUInt64LE(locatorOffset + 8));
    if (buf.readUInt32LE(z64EocdOffset) !== 0x06064b50) {
      throw new Error('ZIP64 EOCD record missing or invalid');
    }
    if (buf.readBigUInt64LE(z64EocdOffset + 4) !== 44n) {
      throw new Error('ZIP64 EOCD size header must be 44');
    }
    if (buf.readUInt32LE(z64EocdOffset + 16) !== 0 || buf.readUInt32LE(z64EocdOffset + 20) !== 0) {
      throw new Error('Multi-disk ZIP64 disk numbers must be zero');
    }
    recordCount = Number(buf.readBigUInt64LE(z64EocdOffset + 32));
    cdSize = Number(buf.readBigUInt64LE(z64EocdOffset + 40));
    cdOffset = Number(buf.readBigUInt64LE(z64EocdOffset + 48));

    if (z64EocdOffset + 56 !== locatorOffset) {
      throw new Error('ZIP64 structure alignment invalid');
    }
    if (cdOffset + cdSize !== z64EocdOffset) {
      throw new Error('Central directory does not end immediately before ZIP64 EOCD');
    }
  } else {
    recordCount = buf.readUInt16LE(eocdOffset + 10);
    cdSize = buf.readUInt32LE(eocdOffset + 12);
    cdOffset = buf.readUInt32LE(eocdOffset + 16);

    if (cdOffset + cdSize !== eocdOffset) {
      throw new Error('Central directory does not end immediately before EOCD');
    }
  }

  return { recordCount, cdSize, cdOffset };
}

module.exports = {
  parseZipEocd
};
