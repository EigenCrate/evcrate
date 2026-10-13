#!/usr/bin/env node
/**
 * scripts/verify-vscode-companion.mjs
 *
 * Verifies VS Code companion extension VSIX, descriptor, source receipt,
 * ZIP safety, runtime closure, and layout contract for development-checkout
 * and packed-package modes.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  calcCrc32,
  computeBuildIdentity,
  computeCompanionInputDigest,
  validateExtensionJsRuntimeClosure,
  PROJECT_ROOT
} from './build-vscode-companion.mjs';
import {
  ALLOWED_COMPANION_MEDIA_ARCHIVE_PATH,
  assertCompanionMediaEntries,
  assertRecordedCompanionMediaInputs
} from './vscode-companion-media.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function computeSha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

export function parseZipEntries(buffer) {
  // Find End of Central Directory (EOCD)
  let eocdOffset = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error('Invalid ZIP: End of Central Directory record not found');
  }

  const recordCount = buffer.readUInt16LE(eocdOffset + 8);
  const cdSize = buffer.readUInt32LE(eocdOffset + 12);
  const cdOffset = buffer.readUInt32LE(eocdOffset + 16);

  if (cdOffset + cdSize > eocdOffset) {
    throw new Error('Invalid ZIP: Central directory overflows EOCD boundary');
  }

  const entries = new Map();
  let currentOffset = cdOffset;
  let totalExpanded = 0;

  for (let i = 0; i < recordCount; i += 1) {
    if (currentOffset + 46 > cdOffset + cdSize) {
      throw new Error(`Central directory entry ${i} overflows central directory`);
    }
    if (buffer.readUInt32LE(currentOffset) !== 0x02014b50) {
      throw new Error(`Invalid Central Directory header signature at offset ${currentOffset}`);
    }

    const method = buffer.readUInt16LE(currentOffset + 10);
    const crc32 = buffer.readUInt32LE(currentOffset + 16);
    const compressedSize = buffer.readUInt32LE(currentOffset + 20);
    const uncompressedSize = buffer.readUInt32LE(currentOffset + 24);
    const nameLength = buffer.readUInt16LE(currentOffset + 28);
    const extraLength = buffer.readUInt16LE(currentOffset + 30);
    const commentLength = buffer.readUInt16LE(currentOffset + 32);
    const localHeaderOffset = buffer.readUInt32LE(currentOffset + 42);

    const nameBuf = buffer.subarray(currentOffset + 46, currentOffset + 46 + nameLength);
    const entryPath = nameBuf.toString('utf8');

    // Path safety validation
    if (entryPath.includes('\0') || /^[a-zA-Z]:/u.test(entryPath) || entryPath.includes('\\') || entryPath.startsWith('/') || /(?:^|\/)\.\.(?:\/|$)/u.test(entryPath)) {
      throw new Error(`Unsafe ZIP entry path detected: "${entryPath}"`);
    }

    const isAllowed =
      entryPath === '[Content_Types].xml' ||
      entryPath === 'extension.vsixmanifest' ||
      entryPath === 'extension/package.json' ||
      /^extension\/dist\/[a-zA-Z0-9._-]+\.js$/u.test(entryPath) ||
      ALLOWED_COMPANION_MEDIA_ARCHIVE_PATH.test(entryPath);
    if (!isAllowed) {
      throw new Error(`Unexpected entry in VSIX archive: "${entryPath}"`);
    }
    if (entries.has(entryPath)) {
      throw new Error(`Duplicate ZIP entry detected: "${entryPath}"`);
    }

    // Zip-bomb protection
    if (uncompressedSize > 16 * 1024 * 1024) {
      throw new Error(`ZIP entry ${entryPath} exceeds maximum 16MB uncompressed limit`);
    }
    totalExpanded += uncompressedSize;
    if (totalExpanded > 64 * 1024 * 1024) {
      throw new Error(`Total expanded ZIP size exceeds maximum 64MB limit`);
    }

    // Read and decompress local entry data
    if (localHeaderOffset + 30 > cdOffset || localHeaderOffset + 30 > buffer.length) {
      throw new Error(`Local header for ${entryPath} overflows central directory`);
    }
    if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
      throw new Error(`Invalid local header signature for ${entryPath}`);
    }
    const localNameLen = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataOffset = localHeaderOffset + 30 + localNameLen + localExtraLen;

    if (dataOffset + compressedSize > buffer.length) {
      throw new Error(`Local data for ${entryPath} overflows archive buffer`);
    }

    const compressedData = buffer.subarray(dataOffset, dataOffset + compressedSize);
    let data;
    if (method === 0) {
      data = compressedData;
    } else if (method === 8) {
      data = zlib.inflateRawSync(compressedData, { maxOutputLength: 16 * 1024 * 1024 });
    } else {
      throw new Error(`Unsupported compression method ${method} for ${entryPath}`);
    }

    if (data.length !== uncompressedSize) {
      throw new Error(`Decompressed size mismatch for ${entryPath}: expected ${uncompressedSize}, got ${data.length}`);
    }

    const actualCrc = calcCrc32(data);
    if (actualCrc !== crc32) {
      throw new Error(`CRC32 mismatch for ${entryPath}: expected ${crc32}, got ${actualCrc}`);
    }

    entries.set(entryPath, {
      path: entryPath,
      size: uncompressedSize,
      compressedSize,
      crc32,
      data
    });

    currentOffset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

export async function verifyVscodeCompanion(options = {}) {
  const projectRoot = options.projectRoot || PROJECT_ROOT;
  const logger = options.logger || console;

  let mode = options.mode;
  if (!mode) {
    const devSourcePresent = fs.existsSync(path.join(projectRoot, 'extensions', 'vscode-model-bindings', 'src'));
    mode = devSourcePresent ? 'development-checkout' : 'packed-package';
  }

  const companionDir = options.companionDir || path.join(projectRoot, '.evcrate', 'targets', 'vscode', 'files', 'evcrate', 'companion');
  const descriptorPath = path.join(companionDir, 'package.json');
  const receiptPath = path.join(companionDir, 'source-receipt.json');

  if (!fs.existsSync(descriptorPath)) {
    throw new Error(`Companion descriptor missing at ${descriptorPath}`);
  }
  if (!fs.existsSync(receiptPath)) {
    throw new Error(`Companion source receipt missing at ${receiptPath}`);
  }

  const descriptor = JSON.parse(fs.readFileSync(descriptorPath, 'utf8'));
  const sourceReceipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));

  // Import contracts validator using pathToFileURL for Windows portability
  const contractsPath = path.join(projectRoot, 'dist', 'adapters', 'vscode', 'companion-package-contracts.js');
  const cliContractsPath = path.join(projectRoot, 'dist', 'adapters', 'vscode', 'companion-cli-contracts.js');

  let validateCompanionDescriptor;
  let validateCompanionSourceReceipt;
  let verifyCompanionLayoutContract;

  if (fs.existsSync(contractsPath) && fs.existsSync(cliContractsPath)) {
    const contracts = await import(pathToFileURL(contractsPath).href);
    const cliContracts = await import(pathToFileURL(cliContractsPath).href);
    validateCompanionDescriptor = contracts.validateCompanionDescriptor;
    validateCompanionSourceReceipt = contracts.validateCompanionSourceReceipt;
    verifyCompanionLayoutContract = cliContracts.verifyCompanionLayoutContract;
  } else {
    throw new Error('Compiled contracts missing in dist/adapters/vscode/; run npm run build first.');
  }

  const validDescriptor = validateCompanionDescriptor(descriptor);
  const validReceipt = validateCompanionSourceReceipt(sourceReceipt);

  if (validDescriptor.version !== validReceipt.version) {
    throw new Error(`Descriptor version (${validDescriptor.version}) does not match receipt version (${validReceipt.version})`);
  }
  if (validDescriptor.buildIdentity !== validReceipt.buildIdentity) {
    throw new Error(`Descriptor buildIdentity does not match receipt buildIdentity`);
  }

  // Verify VSIX file
  const vsixPath = path.join(companionDir, `evcrate-model-bindings-${validDescriptor.version}.vsix`);
  if (!fs.existsSync(vsixPath)) {
    throw new Error(`Companion VSIX missing at ${vsixPath}`);
  }
  const stat = fs.lstatSync(vsixPath);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`VSIX must be a regular non-symlink file: ${vsixPath}`);
  }

  const vsixBuffer = fs.readFileSync(vsixPath);
  const actualVsixSha256 = computeSha256(vsixBuffer);
  if (actualVsixSha256 !== validDescriptor.vsixSha256) {
    throw new Error(`VSIX SHA-256 mismatch: expected ${validDescriptor.vsixSha256}, got ${actualVsixSha256}`);
  }

  // Parse and inspect ZIP contents
  const entries = parseZipEntries(vsixBuffer);
  const requiredFiles = [
    '[Content_Types].xml',
    'extension.vsixmanifest',
    'extension/package.json',
    'extension/dist/extension.js'
  ];
  for (const req of requiredFiles) {
    if (!entries.has(req)) {
      throw new Error(`VSIX missing required entry: ${req}`);
    }
  }
  assertCompanionMediaEntries(entries);

  // Verify embedded package.json
  const extPkg = JSON.parse(entries.get('extension/package.json').data.toString('utf8'));
  if (extPkg.name !== 'evcrate-model-bindings') {
    throw new Error(`Embedded extension name mismatch: ${extPkg.name}`);
  }
  if (extPkg.version !== validDescriptor.version) {
    throw new Error(`Embedded extension version mismatch: expected ${validDescriptor.version}, got ${extPkg.version}`);
  }
  if (extPkg.publisher !== 'eigencrate') {
    throw new Error(`Embedded extension publisher mismatch: ${extPkg.publisher}`);
  }
  if (!Array.isArray(extPkg.enabledApiProposals) || !extPkg.enabledApiProposals.includes('chatPromptFiles')) {
    throw new Error(`Embedded extension missing enabledApiProposals: ["chatPromptFiles"]`);
  }
  if (extPkg.buildIdentity !== validDescriptor.buildIdentity) {
    throw new Error(`Embedded extension buildIdentity mismatch`);
  }

  // Verify extension runtime closure on all JS files in VSIX
  for (const [entryName, entry] of entries) {
    if (entryName.startsWith('extension/dist/') && entryName.endsWith('.js')) {
      validateExtensionJsRuntimeClosure(entryName, entry.data.toString('utf8'));
    }
  }

  // In development checkout mode, cross-check against live sources
  if (mode === 'development-checkout') {
    const srcDir = path.join(projectRoot, 'extensions', 'vscode-model-bindings', 'src');
    if (fs.existsSync(srcDir)) {
      for (const file of fs.readdirSync(srcDir)) {
        if (file.endsWith('.ts')) {
          const relPath = `extensions/vscode-model-bindings/src/${file}`;
          if (!Object.hasOwn(validReceipt.inputs, relPath)) {
            throw new Error(`Unrecorded companion source file detected: ${relPath}`);
          }
        }
      }
    }
    assertRecordedCompanionMediaInputs(projectRoot, validReceipt.inputs);

    // Recompute build identity from receipt inputs and verify coherence
    const recomputedIdentity = computeBuildIdentity(
      validReceipt.extensionId,
      validReceipt.version,
      validReceipt.inputs,
      validReceipt.toolIdentities
    );
    if (recomputedIdentity !== validReceipt.buildIdentity) {
      throw new Error(`Recomputed buildIdentity (${recomputedIdentity}) mismatches receipt (${validReceipt.buildIdentity})`);
    }

    // Compare VSIX JS entries against compiled dist on disk if present
    const distDir = path.join(projectRoot, '.cache', 'evcrate', 'vscode-model-bindings-dist');
    if (fs.existsSync(distDir)) {
      for (const [entryName, entry] of entries) {
        if (entryName.startsWith('extension/dist/')) {
          const distFilename = entryName.slice('extension/dist/'.length);
          const distFullPath = path.join(distDir, distFilename);
          if (fs.existsSync(distFullPath)) {
            const diskData = fs.readFileSync(distFullPath);
            if (!diskData.equals(entry.data)) {
              throw new Error(`VSIX entry "${entryName}" does not match compiled disk output in .cache`);
            }
          }
        }
      }
    }
  }

  // Layout verification
  const layoutInput = {
    mode,
    descriptor: validDescriptor,
    sourceReceipt: validReceipt,
    actualVsixSha256,
    manifestVsixSha256: validDescriptor.vsixSha256
  };

  if (mode === 'development-checkout') {
    const liveInputDigests = {};
    for (const relPath of Object.keys(validReceipt.inputs)) {
      const fullPath = path.join(projectRoot, relPath);
      if (!fs.existsSync(fullPath)) {
        throw new Error(`Missing checkout source input "${relPath}"`);
      }
      liveInputDigests[relPath] = computeCompanionInputDigest(relPath, fullPath);
    }
    layoutInput.liveInputDigests = liveInputDigests;
  }

  const layoutResult = verifyCompanionLayoutContract(layoutInput);
  logger.log(`Verified VS Code companion (${mode}): VSIX SHA-256 ${actualVsixSha256}, buildIdentity: ${validDescriptor.buildIdentity}`);

  return {
    valid: true,
    mode,
    descriptor: validDescriptor,
    sourceReceipt: validReceipt,
    actualVsixSha256,
    checkoutFreshnessVerified: layoutResult.checkoutFreshnessVerified
  };
}

function parseCliArgs(argv) {
  let mode = null;
  let projectRoot = null;
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--mode' && i + 1 < argv.length) {
      mode = argv[++i];
    } else if (arg.startsWith('--mode=')) {
      mode = arg.slice(7);
    } else if (arg === '--project-root' && i + 1 < argv.length) {
      projectRoot = argv[++i];
    } else if (arg.startsWith('--project-root=')) {
      projectRoot = arg.slice(15);
    }
  }
  return { mode, projectRoot };
}

if (process.argv[1] === __filename) {
  const { mode, projectRoot } = parseCliArgs(process.argv);
  verifyVscodeCompanion({ mode, projectRoot })
    .then(() => {
      console.log('Companion verification passed.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Companion verification failed:', err.message);
      process.exit(1);
    });
}
