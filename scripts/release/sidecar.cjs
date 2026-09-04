'use strict';

const HEX_64 = /^[a-f0-9]{64}$/u;
const CONTROL_CHARS_NO_LF = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/u;

function sidecarName(archiveName) {
  if (!archiveName || archiveName.includes('/') || archiveName.includes('\\')) {
    throw new Error('Invalid archive basename');
  }
  return `${archiveName}.sha256`;
}

function serializeSidecar(digest, basename) {
  if (!HEX_64.test(digest)) {
    throw new Error('Invalid SHA-256 digest');
  }
  if (!basename || basename.includes('/') || basename.includes('\\') || basename.trim() !== basename ||
      basename === '.' || basename === '..' || CONTROL_CHARS_NO_LF.test(basename) || basename.includes('\n')) {
    throw new Error('Invalid sidecar basename');
  }
  return `${digest.toLowerCase()}  ${basename}\n`;
}

function parseSidecar(content, expectedBasename) {
  if (typeof content !== 'string') {
    throw new TypeError('Sidecar content must be a string');
  }
  if (content.includes('\r') || CONTROL_CHARS_NO_LF.test(content)) {
    throw new Error('Sidecar contains forbidden CR or control characters');
  }
  if (!content.endsWith('\n') || content.endsWith('\n\n')) {
    throw new Error('Sidecar must end with exactly one newline');
  }
  const parts = content.split('\n');
  if (parts.length !== 2 || parts[1] !== '') {
    throw new Error('Sidecar must contain exactly one record');
  }
  const line = parts[0];
  const match = /^([a-f0-9]{64})  ([^/\s\\]+)$/u.exec(line);
  if (!match) {
    throw new Error('Sidecar does not match grammar "<64-hex>  <basename>\\n"');
  }
  const digest = match[1];
  const basename = match[2];
  if (basename === '.' || basename === '..' || basename.trim() !== basename) {
    throw new Error('Sidecar basename is invalid or contains padding');
  }
  if (expectedBasename !== undefined && basename !== expectedBasename) {
    throw new Error('Sidecar basename mismatch with expected archive');
  }
  return { sha256: digest, basename };
}

module.exports = {
  sidecarName,
  serializeSidecar,
  parseSidecar
};
