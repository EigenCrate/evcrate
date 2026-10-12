/**
 * scripts/vscode-companion-media.mjs
 *
 * Shared build and verification helpers for VS Code companion extension
 * static SVG media packaging (`extensions/vscode-model-bindings/media/*.svg`).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_PROJECT_ROOT = path.resolve(__dirname, '..');

export const COMPANION_MEDIA_DIR_REL_PATH = 'extensions/vscode-model-bindings/media';
export const COMPANION_MEDIA_HELPER_REL_PATH = 'scripts/vscode-companion-media.mjs';
export const REQUIRED_COMPANION_ICON_NAME = 'evcrate-icon.svg';
export const REQUIRED_COMPANION_ICON_SOURCE_PATH = 'extensions/vscode-model-bindings/media/evcrate-icon.svg';
export const REQUIRED_COMPANION_ICON_ARCHIVE_PATH = 'extension/media/evcrate-icon.svg';
export const SAFE_COMPANION_SVG_BASENAME = /^[a-zA-Z0-9._-]+\.svg$/u;
export const ALLOWED_COMPANION_MEDIA_ARCHIVE_PATH = /^extension\/media\/[a-zA-Z0-9._-]+\.svg$/u;

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

/**
 * Enumerates flat `extensions/vscode-model-bindings/media/*.svg` sorted by code-point order,
 * validates safe basenames (`^[a-zA-Z0-9._-]+\.svg$`), requires `evcrate-icon.svg` to exist,
 * and returns `{ sourcePath, archivePath, data }[]`.
 */
export function listCompanionSvgMedia(projectRoot = DEFAULT_PROJECT_ROOT) {
  const mediaDir = path.join(projectRoot, 'extensions', 'vscode-model-bindings', 'media');
  if (!fs.existsSync(mediaDir)) {
    throw new Error(`Required companion media file missing: ${REQUIRED_COMPANION_ICON_SOURCE_PATH}`);
  }
  const dirStat = fs.lstatSync(mediaDir);
  if (dirStat.isSymbolicLink() || !dirStat.isDirectory()) {
    throw new Error(`Companion media path must be a regular directory: ${COMPANION_MEDIA_DIR_REL_PATH}`);
  }

  const names = fs.readdirSync(mediaDir).sort(compareCodePoints);
  const records = [];

  for (const name of names) {
    const fullPath = path.join(mediaDir, name);
    const stat = fs.lstatSync(fullPath);
    if (stat.isSymbolicLink()) {
      throw new Error(`Symbolic link forbidden in companion media directory: ${name}`);
    }
    if (stat.isDirectory()) {
      throw new Error(`Nested directories forbidden in companion media directory: ${name}`);
    }
    if (!stat.isFile()) {
      throw new Error(`Companion media entry must be a regular file: ${name}`);
    }
    if (!SAFE_COMPANION_SVG_BASENAME.test(name)) {
      throw new Error(`Unsafe or unexpected companion media filename: "${name}"`);
    }

    const sourcePath = `${COMPANION_MEDIA_DIR_REL_PATH}/${name}`;
    const archivePath = `extension/media/${name}`;
    const data = fs.readFileSync(fullPath);
    if (data.length === 0) {
      throw new Error(`Companion media SVG file must not be empty: ${sourcePath}`);
    }

    records.push({
      sourcePath,
      archivePath,
      data
    });
  }

  if (!records.some((record) => record.archivePath === REQUIRED_COMPANION_ICON_ARCHIVE_PATH)) {
    throw new Error(`Required companion media file missing: ${REQUIRED_COMPANION_ICON_SOURCE_PATH}`);
  }

  return records;
}

/**
 * Verifies `extension/media/evcrate-icon.svg` exists in parsed ZIP `entries` and is non-empty.
 */
export function assertCompanionMediaEntries(entries) {
  if (!(entries instanceof Map) || !entries.has(REQUIRED_COMPANION_ICON_ARCHIVE_PATH)) {
    throw new Error(`VSIX missing required entry: ${REQUIRED_COMPANION_ICON_ARCHIVE_PATH}`);
  }
  const iconEntry = entries.get(REQUIRED_COMPANION_ICON_ARCHIVE_PATH);
  if (!iconEntry || !Buffer.isBuffer(iconEntry.data) || iconEntry.data.length === 0) {
    throw new Error(`VSIX required media entry is empty: ${REQUIRED_COMPANION_ICON_ARCHIVE_PATH}`);
  }
}

/**
 * In `development-checkout` mode, verifies `scripts/vscode-companion-media.mjs` and
 * every current `extensions/vscode-model-bindings/media/*.svg` file are recorded in `inputs`.
 */
export function assertRecordedCompanionMediaInputs(projectRoot = DEFAULT_PROJECT_ROOT, inputs) {
  if (typeof inputs !== 'object' || inputs === null || Array.isArray(inputs)) {
    throw new Error('Companion source receipt inputs must be an object');
  }
  if (!Object.hasOwn(inputs, COMPANION_MEDIA_HELPER_REL_PATH)) {
    throw new Error(`Unrecorded companion source file detected: ${COMPANION_MEDIA_HELPER_REL_PATH}`);
  }
  const mediaRecords = listCompanionSvgMedia(projectRoot);
  for (const record of mediaRecords) {
    if (!Object.hasOwn(inputs, record.sourcePath)) {
      throw new Error(`Unrecorded companion media source file detected: ${record.sourcePath}`);
    }
  }
}
