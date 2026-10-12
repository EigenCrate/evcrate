#!/usr/bin/env node
/**
 * scripts/build-vscode-companion.mjs
 *
 * Compiles the private VS Code companion extension, validates runtime closure,
 * computes deterministic build identity and inputs receipt, and packages the normalized VSIX
 * into .evcrate/targets/vscode/files/evcrate/companion/.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import moduleBuiltin from 'node:module';
import ts from 'typescript';

import { buildTypeScript } from './build-typescript.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const PROJECT_ROOT = path.resolve(__dirname, '..');

export const VSCODE_EXTENSION_ID = 'eigencrate.evcrate-model-bindings';
export const VSCODE_PROPOSED_API_FLAG = '--enable-proposed-api=eigencrate.evcrate-model-bindings';
export const VSCODE_COMPANION_DESCRIPTOR_SCHEMA_V1 = 'evcrate-vscode-companion-descriptor-v1';
export const VSCODE_COMPANION_SOURCE_RECEIPT_SCHEMA_V1 = 'evcrate-vscode-companion-source-receipt-v1';

export const PINNED_VSCODE_HOST_TUPLE = Object.freeze({
  vscodeVersion: '1.140.0',
  vscodeCommit: '07f806f999227108933c2e30515b26eecc1fda74',
  copilotChatVersion: '0.68.0',
  apiProposal: 'chatPromptFiles',
  extensionKind: Object.freeze(['workspace'])
});

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i += 1) {
  let c = i;
  for (let k = 0; k < 8; k += 1) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[i] = c >>> 0;
}

export function calcCrc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i += 1) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

export function compareCodePoints(a, b) {
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

export function createDeterministicZipBuffer(records) {
  const localChunks = [];
  const cdChunks = [];
  let currentOffset = 0;
  const dosTime = 0;
  const dosDate = (46 << 9) | (1 << 5) | 1; // 2026-01-01

  const sorted = [...records].sort((a, b) => compareCodePoints(a.path, b.path));

  for (const rec of sorted) {
    const nameBuf = Buffer.from(rec.path, 'utf8');
    const data = rec.data;
    const compressed = zlib.deflateRawSync(data, { level: 9 });
    const crc = calcCrc32(data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localChunks.push(localHeader, nameBuf, compressed);

    const cdHeader = Buffer.alloc(46);
    cdHeader.writeUInt32LE(0x02014b50, 0);
    cdHeader.writeUInt16LE(0x0314, 4);
    cdHeader.writeUInt16LE(20, 6);
    cdHeader.writeUInt16LE(0x0800, 8);
    cdHeader.writeUInt16LE(8, 10);
    cdHeader.writeUInt16LE(dosTime, 12);
    cdHeader.writeUInt16LE(dosDate, 14);
    cdHeader.writeUInt32LE(crc, 16);
    cdHeader.writeUInt32LE(compressed.length, 20);
    cdHeader.writeUInt32LE(data.length, 24);
    cdHeader.writeUInt16LE(nameBuf.length, 28);
    cdHeader.writeUInt16LE(0, 30);
    cdHeader.writeUInt16LE(0, 32);
    cdHeader.writeUInt16LE(0, 34);
    cdHeader.writeUInt16LE(0, 36);
    const mode = rec.mode || 0o644;
    const posixMode = (0o100000 | (mode & 0o777)) >>> 0;
    cdHeader.writeUInt32LE((posixMode << 16) >>> 0, 38);
    cdHeader.writeUInt32LE(currentOffset, 42);

    cdChunks.push(cdHeader, nameBuf);
    currentOffset += 30 + nameBuf.length + compressed.length;
  }

  const cdOffset = currentOffset;
  const cdBuffer = Buffer.concat(cdChunks);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(records.length, 8);
  eocd.writeUInt16LE(records.length, 10);
  eocd.writeUInt32LE(cdBuffer.length, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localChunks, cdBuffer, eocd]);
}

export function validateExtensionJsRuntimeClosure(filePath, code) {
  const sourceFile = ts.createSourceFile(
    filePath,
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS
  );

  const specifiers = [];
  function visit(node) {
    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression) && node.expression.text === 'require') {
        const arg = node.arguments[0];
        if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))) {
          specifiers.push(arg.text);
        }
      }
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const arg = node.arguments[0];
        if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))) {
          specifiers.push(arg.text);
        }
      }
    }
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      specifiers.push(node.moduleSpecifier.text);
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      specifiers.push(node.moduleSpecifier.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  for (const spec of specifiers) {
    if (spec.startsWith('node:')) continue;
    if (spec === 'vscode') continue;
    if (moduleBuiltin.isBuiltin(spec)) continue;
    if (spec.startsWith('./') || spec.startsWith('../')) continue;
    throw new Error(`Forbidden external module import "${spec}" in ${filePath}`);
  }
}

export function computeSha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

export function computeFileSha256(filePath) {
  return computeSha256(fs.readFileSync(filePath));
}

export function computeBuildIdentity(extensionId, version, inputs, toolIdentities) {
  const hasher = crypto.createHash('sha256');
  hasher.update(`extensionId\0${extensionId}\n`);
  hasher.update(`version\0${version}\n`);
  for (const relPath of Object.keys(inputs).sort(compareCodePoints)) {
    hasher.update(`input\0${relPath}\0${inputs[relPath]}\n`);
  }
  for (const tool of Object.keys(toolIdentities).sort(compareCodePoints)) {
    hasher.update(`tool\0${tool}\0${toolIdentities[tool]}\n`);
  }
  return hasher.digest('hex');
}

function writeAtomic(filePath, buffer) {
  const tmpPath = `${filePath}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  fs.writeFileSync(tmpPath, buffer);
  fs.renameSync(tmpPath, filePath);
}

export function buildVscodeCompanion(options = {}) {
  const projectRoot = options.projectRoot || PROJECT_ROOT;
  const logger = options.logger || console;

  const extDir = path.join(projectRoot, 'extensions', 'vscode-model-bindings');
  const extPkgPath = path.join(extDir, 'package.json');
  if (!fs.existsSync(extPkgPath)) {
    throw new Error(`Extension package.json not found at ${extPkgPath}`);
  }
  const extPkg = JSON.parse(fs.readFileSync(extPkgPath, 'utf8'));
  const version = extPkg.version;

  // Clean stale dist files before compiling
  const distDir = path.join(projectRoot, '.cache', 'evcrate', 'vscode-model-bindings-dist');
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
  }

  // 1. Compile extension TypeScript incrementally
  logger.log(`Compiling extension TypeScript (v${version})...`);
  const tsConfigPath = path.join(extDir, 'tsconfig.json');
  const tsResult = buildTypeScript({
    config: tsConfigPath,
    root: projectRoot,
    clean: options.clean || false,
    logger
  });
  if (tsResult.status !== 0) {
    throw new Error(`TypeScript compilation failed with status ${tsResult.status}`);
  }

  // 2. Validate compiled output files and verify runtime closure
  if (!fs.existsSync(distDir)) {
    throw new Error(`Extension dist directory not found at ${distDir}`);
  }
  const distFiles = fs.readdirSync(distDir);
  const jsFiles = distFiles.filter((f) => f.endsWith('.js'));
  if (jsFiles.length === 0) {
    throw new Error(`No compiled .js files found in ${distDir}`);
  }

  for (const file of jsFiles) {
    const fullPath = path.join(distDir, file);
    const content = fs.readFileSync(fullPath, 'utf8');
    validateExtensionJsRuntimeClosure(file, content);
  }

  // 3. Enumerate and hash all development inputs
  const inputs = {};
  const relativeInputPaths = [
    'extensions/vscode-model-bindings/package.json',
    'extensions/vscode-model-bindings/tsconfig.json',
    'extensions/vscode-model-bindings/vscode.proposed.chatPromptFiles.d.ts',
    'src/adapters/vscode/companion-package-contracts.ts',
    'src/adapters/vscode/companion-cli-contracts.ts',
    'package.json',
    'package-lock.json',
    'scripts/build-vscode-companion.mjs',
    'scripts/verify-vscode-companion.mjs'
  ];

  const srcDir = path.join(extDir, 'src');
  for (const file of fs.readdirSync(srcDir).sort(compareCodePoints)) {
    if (file.endsWith('.ts')) {
      relativeInputPaths.push(`extensions/vscode-model-bindings/src/${file}`);
    }
  }

  for (const relPath of relativeInputPaths.sort(compareCodePoints)) {
    const absPath = path.join(projectRoot, relPath);
    if (!fs.existsSync(absPath)) {
      throw new Error(`Required companion input file missing: ${relPath}`);
    }
    inputs[relPath] = computeFileSha256(absPath);
  }

  const toolIdentities = {
    node: process.versions.node.split('.')[0],
    typescript: ts.version
  };

  const buildIdentity = computeBuildIdentity(VSCODE_EXTENSION_ID, version, inputs, toolIdentities);
  function escapeXml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  // 4. Construct VSIX archive entries
  const contentTypesXml = `<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="text/xml" />
  <Default Extension="vsixmanifest" ContentType="text/xml" />
  <Default Extension="json" ContentType="application/json" />
  <Default Extension="js" ContentType="application/javascript" />
</Types>
`;

  const vsixManifestXml = `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
  <Metadata>
    <Identity Id="evcrate-model-bindings" Version="${escapeXml(version)}" Publisher="eigencrate" />
    <DisplayName>${escapeXml(extPkg.displayName || 'EVCrate Runtime Model Bindings')}</DisplayName>
    <Description xml:space="preserve">${escapeXml(extPkg.description || '')}</Description>
  </Metadata>
  <Installation>
    <InstallationTarget Id="Microsoft.VisualStudio.Code" Version="[1.0.0,)" />
  </Installation>
  <Dependencies />
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" />
  </Assets>
</PackageManifest>
`;

  const extensionPkgEmbedded = {
    ...extPkg,
    buildIdentity
  };

  const vsixRecords = [
    { path: '[Content_Types].xml', data: Buffer.from(contentTypesXml, 'utf8') },
    { path: 'extension.vsixmanifest', data: Buffer.from(vsixManifestXml, 'utf8') },
    { path: 'extension/package.json', data: Buffer.from(JSON.stringify(extensionPkgEmbedded, null, 2) + '\n', 'utf8') }
  ];

  for (const file of distFiles.sort(compareCodePoints)) {
    if (file.endsWith('.d.ts') || file.endsWith('.tsbuildinfo')) continue;
    const fullPath = path.join(distDir, file);
    const data = fs.readFileSync(fullPath);
    vsixRecords.push({
      path: `extension/dist/${file}`,
      data
    });
  }

  const vsixBuffer = createDeterministicZipBuffer(vsixRecords);
  const vsixSha256 = computeSha256(vsixBuffer);
  const vsixFilename = `evcrate-model-bindings-${version}.vsix`;
  const vsixRelativePath = `evcrate/companion/${vsixFilename}`;

  // 5. Construct Companion Descriptor and Source Receipt
  const descriptor = {
    schema: VSCODE_COMPANION_DESCRIPTOR_SCHEMA_V1,
    extensionId: VSCODE_EXTENSION_ID,
    version,
    buildIdentity,
    vsixRelativePath,
    vsixSha256,
    supportedHost: PINNED_VSCODE_HOST_TUPLE,
    intentSchema: 'evcrate-vscode-agent-intent-v1'
  };

  const sourceReceipt = {
    schema: VSCODE_COMPANION_SOURCE_RECEIPT_SCHEMA_V1,
    extensionId: VSCODE_EXTENSION_ID,
    version,
    buildIdentity,
    inputs,
    toolIdentities
  };

  // 6. Write output files to .evcrate/targets/vscode/files/evcrate/companion/
  const outDir = path.join(projectRoot, '.evcrate', 'targets', 'vscode', 'files', 'evcrate', 'companion');
  fs.mkdirSync(outDir, { recursive: true });

  // Clean old vsix versions
  for (const entry of fs.readdirSync(outDir)) {
    if (entry.startsWith('evcrate-model-bindings-') && entry.endsWith('.vsix') && entry !== vsixFilename) {
      fs.unlinkSync(path.join(outDir, entry));
    }
  }

  const vsixPath = path.join(outDir, vsixFilename);
  const descPath = path.join(outDir, 'package.json');
  const receiptPath = path.join(outDir, 'source-receipt.json');

  writeAtomic(vsixPath, vsixBuffer);
  writeAtomic(descPath, Buffer.from(JSON.stringify(descriptor, null, 2) + '\n', 'utf8'));
  writeAtomic(receiptPath, Buffer.from(JSON.stringify(sourceReceipt, null, 2) + '\n', 'utf8'));

  logger.log(`Generated VSIX: ${vsixPath} (${vsixBuffer.length} bytes, sha256: ${vsixSha256})`);
  logger.log(`Generated Descriptor: ${descPath} (buildIdentity: ${buildIdentity})`);
  logger.log(`Generated Receipt: ${receiptPath} (${Object.keys(inputs).length} inputs)`);

  return {
    version,
    buildIdentity,
    vsixRelativePath,
    vsixSha256,
    vsixBuffer,
    descriptor,
    sourceReceipt
  };
}

if (process.argv[1] === __filename) {
  try {
    buildVscodeCompanion();
  } catch (error) {
    console.error('Failed to build VS Code companion extension:', error);
    process.exit(1);
  }
}
