import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseZipEntries } from '../../scripts/verify-vscode-companion.mjs';
import { validateVscodeCompanionClosure } from '../../scripts/release/runtime-closure.cjs';
import { createProjectionBuildContext, createStagedRoot } from '../../dist/index.js';

import {
  VSCODE_EXTENSION_ID,
  PINNED_VSCODE_HOST_TUPLE,
  VSCODE_COMPANION_DESCRIPTOR_SCHEMA_V1,
  VSCODE_COMPANION_SOURCE_RECEIPT_SCHEMA_V1,
  validateExtensionJsRuntimeClosure,
  createDeterministicZipBuffer,
  buildVscodeCompanion
} from '../../scripts/build-vscode-companion.mjs';
import { verifyVscodeCompanion } from '../../scripts/verify-vscode-companion.mjs';
import {
  validateCompanionDescriptor,
  validateCompanionSourceReceipt
} from '../../dist/adapters/vscode/companion-package-contracts.js';
import {
  verifyCompanionLayoutContract
} from '../../dist/adapters/vscode/companion-cli-contracts.js';
import { verifyPackCompanionArtifacts } from '../../scripts/release/pack-inventory.cjs';
import { mergeTargetOverlayArtifacts } from '../../dist/distribution/overlay-staging.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, '..', '..');

test('companion host tuple, extension ID, and descriptor/receipt schemas are pinned', () => {
  assert.equal(VSCODE_EXTENSION_ID, 'eigencrate.evcrate-model-bindings');
  assert.equal(PINNED_VSCODE_HOST_TUPLE.vscodeVersion, '1.140.0');
  assert.equal(PINNED_VSCODE_HOST_TUPLE.copilotChatVersion, '0.68.0');
  assert.equal(PINNED_VSCODE_HOST_TUPLE.apiProposal, 'chatPromptFiles');
  assert.deepEqual(PINNED_VSCODE_HOST_TUPLE.extensionKind, ['workspace']);
});

test('deterministic ZIP buffer produces valid archive with byte stability', () => {
  const records = [
    { path: 'b.txt', data: Buffer.from('hello b') },
    { path: 'a.txt', data: Buffer.from('hello a') }
  ];
  const zip1 = createDeterministicZipBuffer(records);
  const zip2 = createDeterministicZipBuffer(records);
  assert.deepEqual(zip1, zip2);
  assert.ok(zip1.length > 50);
});

test('validateExtensionJsRuntimeClosure enforces allowed modules and rejects foreign specifiers', () => {
  const validJs = `
    const fs = require('node:fs');
    const path = require('path');
    const vscode = require('vscode');
    const local = require('./binding-store.js');
  `;
  assert.doesNotThrow(() => validateExtensionJsRuntimeClosure('test.js', validJs));

  const invalidJs = `
    const axios = require('axios');
  `;
  assert.throws(() => validateExtensionJsRuntimeClosure('test.js', invalidJs), /Forbidden external module import "axios"/);
});

test('verifyVscodeCompanion succeeds on current repository companion artifacts in both modes', async () => {
  const devResult = await verifyVscodeCompanion({ projectRoot: packageRoot, mode: 'development-checkout' });
  assert.equal(devResult.valid, true);
  assert.equal(devResult.checkoutFreshnessVerified, true);
  assert.equal(devResult.descriptor.extensionId, VSCODE_EXTENSION_ID);
  assert.equal(devResult.descriptor.schema, VSCODE_COMPANION_DESCRIPTOR_SCHEMA_V1);
  assert.equal(devResult.sourceReceipt.schema, VSCODE_COMPANION_SOURCE_RECEIPT_SCHEMA_V1);

  const packedResult = await verifyVscodeCompanion({ projectRoot: packageRoot, mode: 'packed-package' });
  assert.equal(packedResult.valid, true);
  assert.equal(packedResult.checkoutFreshnessVerified, false);
});

test('layout contract verifier detects tampered live input digest', async () => {
  const companionDir = path.join(packageRoot, '.evcrate', 'targets', 'vscode', 'files', 'evcrate', 'companion');
  const desc = JSON.parse(fs.readFileSync(path.join(companionDir, 'package.json'), 'utf8'));
  const receipt = JSON.parse(fs.readFileSync(path.join(companionDir, 'source-receipt.json'), 'utf8'));

  const validDescriptor = validateCompanionDescriptor(desc);
  const validReceipt = validateCompanionSourceReceipt(receipt);

  const tamperedDigests = {
    ...validReceipt.inputs,
    'package.json': '0'.repeat(64)
  };

  assert.throws(() => {
    verifyCompanionLayoutContract({
      mode: 'development-checkout',
      descriptor: validDescriptor,
      sourceReceipt: validReceipt,
      actualVsixSha256: validDescriptor.vsixSha256,
      manifestVsixSha256: validDescriptor.vsixSha256,
      liveInputDigests: tamperedDigests
    });
  }, { code: 'STALE_CHECKOUT_INPUT' });
});

test('verifyPackCompanionArtifacts enforces presence, hashes, and consistency', () => {
  const companionDir = path.join(packageRoot, '.evcrate', 'targets', 'vscode', 'files', 'evcrate', 'companion');
  const descData = fs.readFileSync(path.join(companionDir, 'package.json'));
  const desc = JSON.parse(descData.toString('utf8'));
  const vsixPath = path.join(companionDir, `evcrate-model-bindings-${desc.version}.vsix`);
  const vsixData = fs.readFileSync(vsixPath);
  const vsixSha256 = crypto.createHash('sha256').update(vsixData).digest('hex');
  const receiptData = fs.readFileSync(path.join(companionDir, 'source-receipt.json'));

  const validRecords = [
    {
      path: '.evcrate/targets/vscode/files/evcrate/companion/package.json',
      data: descData,
      sha256: crypto.createHash('sha256').update(descData).digest('hex')
    },
    {
      path: '.evcrate/targets/vscode/files/evcrate/companion/source-receipt.json',
      data: receiptData,
      sha256: crypto.createHash('sha256').update(receiptData).digest('hex')
    },
    {
      path: `.evcrate/targets/vscode/files/evcrate/companion/evcrate-model-bindings-${desc.version}.vsix`,
      data: vsixData,
      sha256: vsixSha256
    },
    {
      path: `.evcrate/source/.evcrate-vscode/evcrate/companion/evcrate-model-bindings-${desc.version}.vsix`,
      data: vsixData,
      sha256: vsixSha256
    }
  ];

  assert.doesNotThrow(() => verifyPackCompanionArtifacts(validRecords, packageRoot));

  // Missing VSIX
  const withoutVsix = validRecords.filter((r) => !r.path.endsWith('.vsix'));
  assert.throws(() => verifyPackCompanionArtifacts(withoutVsix, packageRoot), /Companion VSIX missing from pack records/);

  // Mismatched VSIX hash
  const tamperedVsix = validRecords.map((r) => r.path.endsWith('.vsix') ? { ...r, sha256: '0'.repeat(64) } : r);
  assert.throws(() => verifyPackCompanionArtifacts(tamperedVsix, packageRoot), /mismatches descriptor/);
});

test('mergeTargetOverlayArtifacts ignores non-vscode targets', () => {
  const nonVscodeManifest = { id: 'claude', overlayRoot: null, ownedPaths: [] };
  assert.doesNotThrow(() => mergeTargetOverlayArtifacts(nonVscodeManifest, {}));
});

test('verifyPackCompanionArtifacts fails when vscode target overlay declared but descriptor missing', () => {
  const emptyRecords = [];
  assert.throws(() => verifyPackCompanionArtifacts(emptyRecords, packageRoot), /Required VS Code companion descriptor missing from pack records/);
});

test('version parity is preserved between package.json, extension, and vscode manifest', () => {
  const rootPkg = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  const extPkg = JSON.parse(fs.readFileSync(path.join(packageRoot, 'extensions', 'vscode-model-bindings', 'package.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, '.evcrate', 'targets', 'vscode', 'manifest.json'), 'utf8'));

  assert.equal(extPkg.version, rootPkg.version);
  const expectedVsixOwned = `files/evcrate/companion/evcrate-model-bindings-${rootPkg.version}.vsix`;
  assert.ok(manifest.owned_paths.includes(expectedVsixOwned), `owned_paths must contain ${expectedVsixOwned}`);
});

test('mergeTargetOverlayArtifacts hermetic checks: happy path, collision, undeclared, and tampered', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-overlay-test-'));
  try {
    const filesDir = path.join(tmp, 'files', 'evcrate', 'companion');
    fs.mkdirSync(filesDir, { recursive: true });

    const desc = {
      schema: 'evcrate-vscode-companion-descriptor-v1',
      extensionId: 'eigencrate.evcrate-model-bindings',
      version: '2.11.0',
      buildIdentity: 'a'.repeat(64),
      vsixRelativePath: 'evcrate/companion/evcrate-model-bindings-2.11.0.vsix',
      vsixSha256: crypto.createHash('sha256').update(Buffer.from('real-vsix-bytes')).digest('hex'),
      supportedHost: PINNED_VSCODE_HOST_TUPLE,
      intentSchema: 'evcrate-vscode-agent-intent-v1'
    };
    const receipt = {
      schema: 'evcrate-vscode-companion-source-receipt-v1',
      extensionId: 'eigencrate.evcrate-model-bindings',
      version: '2.11.0',
      buildIdentity: 'a'.repeat(64),
      inputs: { 'a.ts': '1'.repeat(64) },
      toolIdentities: { node: '22', typescript: '5.9.3' }
    };

    fs.writeFileSync(path.join(filesDir, 'package.json'), JSON.stringify(desc));
    fs.writeFileSync(path.join(filesDir, 'source-receipt.json'), JSON.stringify(receipt));
    fs.writeFileSync(path.join(filesDir, 'evcrate-model-bindings-2.11.0.vsix'), Buffer.from('real-vsix-bytes'));

    const manifest = {
      id: 'vscode',
      sourceRoot: tmp,
      overlayRoot: path.join(tmp, 'files'),
      outputRoots: ['.evcrate-vscode'],
      projectDocs: [],
      ownedPaths: [
        'files/evcrate/companion/evcrate-model-bindings-2.11.0.vsix',
        'files/evcrate/companion/package.json',
        'files/evcrate/companion/source-receipt.json'
      ]
    };
    const stage = createStagedRoot(tmp, 'stage-');
    const canonicalRoot = path.join(packageRoot, '.evcrate', 'source', '.claude');
    const mockContext = createProjectionBuildContext(manifest, canonicalRoot, stage);

    // 1. Happy path
    assert.doesNotThrow(() => mergeTargetOverlayArtifacts(manifest, mockContext));
    assert.ok(fs.existsSync(mockContext.stagePath('.evcrate-vscode/evcrate/companion/package.json')));

    // 2. Collision rejection
    assert.throws(() => mergeTargetOverlayArtifacts(manifest, mockContext), { code: 'PATH_UNSAFE' });

    // 3. Bad overlay root basename
    const badBaseManifest = { ...manifest, overlayRoot: path.join(tmp, 'not-files') };
    assert.throws(() => mergeTargetOverlayArtifacts(badBaseManifest, mockContext), { code: 'PATH_UNSAFE' });

    // 4. Undeclared file in overlay
    fs.writeFileSync(path.join(filesDir, 'extra-unvetted.txt'), 'danger');
    const stage2 = createStagedRoot(tmp, 'stage2-');
    const freshContext = createProjectionBuildContext(manifest, canonicalRoot, stage2);
    assert.throws(() => mergeTargetOverlayArtifacts(manifest, freshContext), { code: 'PATH_UNSAFE' });

    // 5. Tampered VSIX hash
    fs.unlinkSync(path.join(filesDir, 'extra-unvetted.txt'));
    fs.writeFileSync(path.join(filesDir, 'evcrate-model-bindings-2.11.0.vsix'), Buffer.from('tampered-bytes'));
    const stage3 = createStagedRoot(tmp, 'stage3-');
    const tamperedContext = createProjectionBuildContext(manifest, canonicalRoot, stage3);
    assert.throws(() => mergeTargetOverlayArtifacts(manifest, tamperedContext), { code: 'VALIDATION_INVALID' });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('parseZipEntries rejects path traversal, duplicate entries, unexpected files, and truncated CD', () => {
  const traversalZip = createDeterministicZipBuffer([
    { path: '../evil.txt', data: Buffer.from('evil') }
  ]);
  assert.throws(() => parseZipEntries(traversalZip), /Unsafe ZIP entry path detected/);

  const unexpectedZip = createDeterministicZipBuffer([
    { path: 'unexpected.exe', data: Buffer.from('binary') }
  ]);
  assert.throws(() => parseZipEntries(unexpectedZip), /Unexpected entry in VSIX archive/);

  // Duplicate entry in Central Directory
  const validZip = createDeterministicZipBuffer([
    { path: 'extension/package.json', data: Buffer.from('{}') }
  ]);
  // Duplicate central directory entry manually crafted
  const eocdOff = validZip.length - 22;
  const cdOff = validZip.readUInt32LE(eocdOff + 16);
  const cdLen = validZip.readUInt32LE(eocdOff + 12);
  const cdEntry = validZip.subarray(cdOff, cdOff + cdLen);
  const dupZip = Buffer.concat([
    validZip.subarray(0, cdOff),
    cdEntry,
    cdEntry,
    validZip.subarray(eocdOff)
  ]);
  // Update recordCount and cdSize in EOCD
  dupZip.writeUInt16LE(2, dupZip.length - 14); // recordCount
  dupZip.writeUInt16LE(2, dupZip.length - 12); // totalCount
  dupZip.writeUInt32LE(cdLen * 2, dupZip.length - 10); // cdSize
  assert.throws(() => parseZipEntries(dupZip), /Duplicate ZIP entry detected/);

  // Truncated Central Directory
  const truncatedZip = Buffer.from(validZip);
  truncatedZip.writeUInt32LE(cdLen + 100, truncatedZip.length - 10); // corrupt cdSize > eocdOffset
  assert.throws(() => parseZipEntries(truncatedZip), /Central directory overflows EOCD boundary/);
});

test('validateVscodeCompanionClosure fails closed on corrupt or missing files', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-closure-test-'));
  try {
    fs.mkdirSync(path.join(tmp, '.evcrate', 'targets', 'vscode'), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, '.evcrate', 'targets', 'vscode', 'manifest.json'),
      JSON.stringify({ schema_version: 2, name: 'vscode', overlay_root: '.evcrate/targets/vscode/files' })
    );

    // Missing descriptor
    assert.throws(() => validateVscodeCompanionClosure(tmp), /Required VS Code companion descriptor missing/);

    // Corrupt VSIX (EOCD not found)
    const compDir = path.join(tmp, '.evcrate', 'targets', 'vscode', 'files', 'evcrate', 'companion');
    fs.mkdirSync(compDir, { recursive: true });
    fs.writeFileSync(path.join(compDir, 'package.json'), JSON.stringify({ version: '1.0.0', vsixSha256: crypto.createHash('sha256').update('garbage').digest('hex') }));
    fs.writeFileSync(path.join(compDir, 'evcrate-model-bindings-1.0.0.vsix'), 'garbage');

    assert.throws(() => validateVscodeCompanionClosure(tmp), /Invalid companion VSIX: EOCD not found/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
