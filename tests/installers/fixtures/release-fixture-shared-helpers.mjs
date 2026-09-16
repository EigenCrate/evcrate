import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import { canonicalJsonBytes, sha256Bytes } from '../../../scripts/release/canonical-json.cjs';
import { ADVISOR_CONTROLLER_FILES } from '../../../dist/index.js';

export const PROJECT_ROOT = path.resolve(import.meta.dirname, '../../..');

export function computeControllerClosureDigest(sortedRecords) {
  const controllerMap = {};
  for (const f of ADVISOR_CONTROLLER_FILES) {
    const rec = sortedRecords.find((r) => r.path === `.evcrate/source/.evcrate/bin/${f}`);
    if (rec) {
      controllerMap[`.evcrate/bin/${f}`] = rec.sha256;
    }
  }
  return sha256Bytes(canonicalJsonBytes(controllerMap));
}

export function computeBuildManifestDigests(sortedRecords) {
  const buildManifestDigests = {};
  for (const rec of sortedRecords) {
    if (rec.path.startsWith('.evcrate/build-manifest')) {
      const key = rec.path === '.evcrate/build-manifest.json'
        ? 'all'
        : rec.path.replace(/^\.evcrate\/build-manifest-/u, '').replace(/\.json$/u, '');
      buildManifestDigests[key] = rec.sha256;
    }
  }
  return buildManifestDigests;
}

export function getRealInstallerEntry(installerName, projectRoot = PROJECT_ROOT, customContent = null) {
  let data;
  if (customContent != null) {
    data = Buffer.isBuffer(customContent) ? customContent : Buffer.from(customContent);
  } else {
    data = fs.readFileSync(path.join(projectRoot, installerName));
  }
  const sha256 = crypto.createHash('sha256').update(data).digest('hex');
  return {
    name: installerName,
    data,
    size: data.length,
    sha256
  };
}
