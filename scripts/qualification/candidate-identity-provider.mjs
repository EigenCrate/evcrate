/**
 * candidate-identity-provider.mjs
 *
 * Provides cryptographic digests, directory tree hashes, and pinned runtime
 * identities for Phase 08 VS Code Local qualification.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const REPO_ROOT = path.resolve(__dirname, '../..');

export const REPORTS_ROOT = path.join(
  REPO_ROOT,
  'plans/261002-2213-vscode-local-native-support/reports/native-local'
);

export function hashFile(filepath) {
  if (!fs.existsSync(filepath)) return 'MISSING';
  return crypto.createHash('sha256').update(fs.readFileSync(filepath)).digest('hex');
}

export function computeTreeHash(dir) {
  if (!fs.existsSync(dir)) return { count: 0, hash: 'MISSING' };
  function walk(current) {
    let list = [];
    for (const ent of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, ent.name);
      if (ent.isDirectory()) {
        list = list.concat(walk(full));
      } else {
        list.push(full);
      }
    }
    return list;
  }
  const files = walk(dir).sort();
  const hasher = crypto.createHash('sha256');
  for (const f of files) {
    const rel = path.relative(dir, f).replace(/\\/g, '/');
    const fhash = crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
    hasher.update(rel + ':' + fhash + '\n');
  }
  return { count: files.length, hash: hasher.digest('hex') };
}

export const CANDIDATE_IDENTITY = {
  vscodeVersion: '1.140.0',
  vscodeCommit: '07f806f999227108933c2e30515b26eecc1fda74',
  copilotChatVersion: '0.68.0',
  copilotRuntime: '@github/copilot-sdk-linux-x64/prebuilds/linux-x64/copilot-runtime',
  arch: 'x64',
  platform: 'linux',
  kernel: os.release(),
  nodeVersion: process.version,
  digests: {
    targetsManifest: hashFile(path.join(REPO_ROOT, '.evcrate/targets/manifest.json')),
    registryJson: hashFile(path.join(REPO_ROOT, '.evcrate/registry.json')),
    pluginJson: hashFile(path.join(REPO_ROOT, '.evcrate/source/.evcrate-vscode/plugin.json')),
    hooksJson: hashFile(path.join(REPO_ROOT, '.evcrate/source/.evcrate-vscode/com.github.copilot/hooks/hooks.json')),
    bridgeScript: hashFile(path.join(REPO_ROOT, '.evcrate/source/.evcrate-vscode/evcrate/runtime/local-hook-bridge.cjs')),
    bootstrapRules: hashFile(path.join(REPO_ROOT, '.evcrate/source/.evcrate-vscode/com.github.copilot/rules/bootstrap.instructions.md'))
  },
  pluginTree: computeTreeHash(path.join(REPO_ROOT, '.evcrate/source/.evcrate-vscode'))
};
