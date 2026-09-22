'use strict';

/**
 * @file tar-verifier.cjs
 * Independent read-only tar.gz unpacker and structure verifier for plugin packaging (Phase E04).
 */

const fs = require('node:fs');
const zlib = require('node:zlib');
const crypto = require('node:crypto');

function parseTarArchive(tarGzPath) {
  if (!fs.existsSync(tarGzPath)) {
    throw new Error(`Tarball does not exist: ${tarGzPath}`);
  }

  const gzipped = fs.readFileSync(tarGzPath);
  const tarBuf = zlib.gunzipSync(gzipped);

  const entries = new Map();
  let offset = 0;
  let currentPax = null;

  while (offset + 512 <= tarBuf.length) {
    const header = tarBuf.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break; // EOF 2 consecutive zero blocks

    const name = header.toString('utf8', 0, 100).replace(/\0.*$/, '');
    const prefix = header.toString('utf8', 345, 500).replace(/\0.*$/, '');
    let fullPath = prefix ? `${prefix}/${name}` : name;
    const typeflag = String.fromCharCode(header[156]);

    const sizeStr = header.toString('ascii', 124, 136).replace(/\0.*$/, '').trim();
    const size = parseInt(sizeStr, 8) || 0;

    const modeStr = header.toString('ascii', 100, 108).replace(/\0.*$/, '').trim();
    const mode = parseInt(modeStr, 8) || 0o644;

    offset += 512;
    const data = tarBuf.subarray(offset, offset + size);
    const pad = size % 512 === 0 ? 0 : 512 - (size % 512);
    offset += size + pad;

    // Pax extended header
    if (typeflag === 'x') {
      const paxText = data.toString('utf8');
      const match = paxText.match(/^\d+ path=(.+)\n$/);
      if (match) currentPax = match[1];
      continue;
    }

    if (currentPax) {
      fullPath = currentPax;
      currentPax = null;
    }

    // Normal regular file
    if (typeflag === '0' || typeflag === '\0') {
      if (entries.has(fullPath)) {
        throw new Error(`Duplicate entry forbidden in plugin archive: ${fullPath}`);
      }
      const sha256 = crypto.createHash('sha256').update(data).digest('hex');
      entries.set(fullPath, {
        path: fullPath,
        size,
        mode,
        sha256,
        data
      });
    } else {
      throw new Error(`Special file or link forbidden in plugin archive: ${fullPath} (type ${typeflag})`);
    }
  }

  return {
    rawArchiveSize: gzipped.length,
    expandedSize: tarBuf.length,
    entries
  };
}

module.exports = {
  parseTarArchive
};
