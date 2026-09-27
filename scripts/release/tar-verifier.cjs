'use strict';

const fs = require('node:fs');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const {
  MAX_ARCHIVE_BYTES,
  MAX_TOTAL_EXPANDED_BYTES,
  validateInventoryPath
} = require('./path-policy.cjs');

function parseStrictOctal(buf, fieldName) {
  const str = buf.toString('ascii').replace(/\0.*$/u, '').trim();
  if (str === '') return 0;
  if (!/^[0-7]+$/u.test(str)) {
    throw new Error(`Invalid octal field "${fieldName}" in tar header: "${str}"`);
  }
  const val = parseInt(str, 8);
  if (!Number.isSafeInteger(val) || val < 0) {
    throw new Error(`Out-of-range octal value in "${fieldName}": ${str}`);
  }
  return val;
}

function verifyChecksum(header) {
  const recorded = parseStrictOctal(header.subarray(148, 154), 'chksum');
  let sum = 0;
  for (let i = 0; i < 512; i += 1) {
    sum += (i >= 148 && i < 156) ? 0x20 : header[i];
  }
  return sum === recorded;
}

function parsePaxPath(data, declaredSize) {
  if (data.length !== declaredSize) {
    throw new Error(`PAX record length ${data.length} does not match declared size ${declaredSize}`);
  }
  const text = data.toString('utf8');
  const match = /^(\d+) path=(.+)\n$/u.exec(text);
  if (!match) {
    throw new Error(`Malformed PAX path record: ${JSON.stringify(text)}`);
  }
  const declaredLen = parseInt(match[1], 10);
  if (Buffer.byteLength(text, 'utf8') !== declaredLen) {
    throw new Error(`PAX length field mismatch: declared ${declaredLen}, actual ${Buffer.byteLength(text, 'utf8')}`);
  }
  return match[2];
}

function decompressTarBounded(archivePath) {
  const stat = fs.statSync(archivePath);
  if (stat.size > MAX_ARCHIVE_BYTES) {
    throw new Error(`Archive size ${stat.size} exceeds maximum ${MAX_ARCHIVE_BYTES}`);
  }
  const gzipped = fs.readFileSync(archivePath);
  return zlib.gunzipSync(gzipped, { maxOutputLength: MAX_TOTAL_EXPANDED_BYTES });
}

function verifyTarArchive(archivePath, expectedRecords) {
  const tar = decompressTarBounded(archivePath);

  let offset = 0;
  let expectedIndex = 0;
  let pendingPaxPath = null;
  let zeroBlockCount = 0;

  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    offset += 512;

    const isAllZero = header.every((b) => b === 0);
    if (isAllZero) {
      zeroBlockCount += 1;
      if (zeroBlockCount >= 2) {
        // Enforce exact remainder semantics: all remaining bytes must be zero
        const remainder = tar.subarray(offset);
        if (!remainder.every((b) => b === 0)) {
          throw new Error('Non-zero trailing data detected after end-of-archive blocks');
        }
        break;
      }
      continue;
    } else if (zeroBlockCount > 0) {
      throw new Error('Single zero block encountered before valid header');
    }

    if (!verifyChecksum(header)) {
      throw new Error(`Invalid tar header checksum at offset ${offset - 512}`);
    }

    const magic = header.subarray(257, 263).toString('ascii');
    const version = header.subarray(263, 265).toString('ascii');
    if (magic !== 'ustar\0') {
      throw new Error(`Invalid tar magic at offset ${offset - 512}: "${magic}"`);
    }
    if (version !== '00') {
      throw new Error(`Invalid tar version at offset ${offset - 512}: "${version}"`);
    }

    const typeflag = String.fromCharCode(header[156] || 0x30);
    const size = parseStrictOctal(header.subarray(124, 135), 'size');
    const mode = parseStrictOctal(header.subarray(100, 107), 'mode');

    const dataPad = size % 512 === 0 ? 0 : 512 - (size % 512);
    if (offset + size + dataPad > tar.length) {
      throw new Error(`Truncated tar payload or padding at offset ${offset}`);
    }

    const fileData = tar.subarray(offset, offset + size);
    const padData = tar.subarray(offset + size, offset + size + dataPad);
    if (!padData.every((b) => b === 0)) {
      throw new Error(`Tar data padding must contain only zeros at offset ${offset + size}`);
    }
    offset += size + dataPad;

    if (typeflag === 'x') {
      if (pendingPaxPath !== null) {
        throw new Error('Consecutive PAX headers without file entry');
      }
      pendingPaxPath = parsePaxPath(fileData, size);
      continue;
    }

    if (typeflag !== '0' && typeflag !== '\0') {
      throw new Error(`Unsupported or unsafe tar entry typeflag "${typeflag}"`);
    }

    let entryPath = pendingPaxPath;
    pendingPaxPath = null;

    if (!entryPath) {
      const rawName = header.subarray(0, 100).toString('utf8').replace(/\0.*$/u, '');
      const rawPrefix = header.subarray(345, 500).toString('utf8').replace(/\0.*$/u, '');
      entryPath = rawPrefix ? `${rawPrefix}/${rawName}` : rawName;
    }

    if (!entryPath.startsWith('package/')) {
      throw new Error(`Entry does not start with package/: ${entryPath}`);
    }

    const packageRelative = entryPath.slice('package/'.length);
    validateInventoryPath(packageRelative);

    if (expectedIndex >= expectedRecords.length) {
      throw new Error(`Extra entry in archive not in expected records: ${entryPath}`);
    }

    const expected = expectedRecords[expectedIndex];
    if (packageRelative !== expected.path) {
      throw new Error(`Entry order mismatch at #${expectedIndex}: got "${packageRelative}", expected "${expected.path}"`);
    }

    if (fileData.length !== expected.size) {
      throw new Error(`Size mismatch for ${entryPath}: got ${fileData.length}, expected ${expected.size}`);
    }


    const sha256 = crypto.createHash('sha256').update(fileData).digest('hex');
    if (sha256 !== expected.sha256) {
      throw new Error(`SHA-256 mismatch for ${entryPath}: got ${sha256}, expected ${expected.sha256}`);
    }

    expectedIndex += 1;
  }

  if (pendingPaxPath !== null) {
    throw new Error('Dangling PAX header at end of archive');
  }

  // End of archive requirement: must have seen at least 2 zero blocks
  if (zeroBlockCount < 2) {
    throw new Error(`Archive truncated: missing terminal two zero blocks (saw ${zeroBlockCount})`);
  }

  if (expectedIndex !== expectedRecords.length) {
    throw new Error(`Verified count ${expectedIndex} does not match expected ${expectedRecords.length}`);
  }

  return true;
}

module.exports = {
  verifyTarArchive
};
