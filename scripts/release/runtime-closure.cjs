'use strict';

const fs = require('node:fs');
const path = require('node:path');
const moduleBuiltin = require('node:module');
const { extractSpecifiersFromAst } = require('./ast-scanner.cjs');
const zlib = require('node:zlib');
const crypto = require('node:crypto');

function assertNoSymlinkAncestors(targetPath) {
  let current = path.resolve(targetPath);
  while (true) {
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) {
      throw new Error(`Symbolic link path forbidden: ${current}`);
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

function resolveAndValidateSpecifier(specifier, currentFile, distRoot, realDistRoot) {
  if (specifier.startsWith('node:')) {
    if (!moduleBuiltin.isBuiltin(specifier)) {
      throw new Error(`Unrecognized node: built-in "${specifier}" in ${currentFile}`);
    }
    return null;
  }

  if (!specifier.startsWith('.')) {
    throw new Error(`Bare specifier "${specifier}" forbidden in runtime closure (in ${currentFile})`);
  }

  const candidateBase = path.resolve(path.dirname(currentFile), specifier);
  let resolved = candidateBase;

  if (!fs.existsSync(resolved) && fs.existsSync(`${resolved}.js`)) {
    resolved = `${resolved}.js`;
  }

  if (!fs.existsSync(resolved)) {
    throw new Error(`Unresolved relative module "${specifier}" from ${currentFile}`);
  }

  assertNoSymlinkAncestors(resolved);

  const stat = fs.lstatSync(resolved);
  if (stat.isDirectory()) {
    const indexJs = path.join(resolved, 'index.js');
    if (!fs.existsSync(indexJs)) {
      throw new Error(`Directory module "${specifier}" missing index.js: ${resolved}`);
    }
    assertNoSymlinkAncestors(indexJs);
    resolved = indexJs;
  } else if (!stat.isFile()) {
    throw new Error(`Module must be a regular file: ${resolved}`);
  }

  if (resolved.endsWith('.node')) {
    throw new Error(`Native addon (.node) forbidden in runtime closure: ${resolved}`);
  }

  if (/\.(?:cs|ps1|exe|dll|cmd|bat)$/iu.test(resolved)) {
    throw new Error(`Non-JS native asset (${path.extname(resolved)}) forbidden in runtime closure: ${resolved}`);
  }

  const realResolved = fs.realpathSync(resolved);
  if (!realResolved.startsWith(`${realDistRoot}${path.sep}`) && realResolved !== realDistRoot) {
    throw new Error(`Module ${realResolved} escapes dist boundary ${realDistRoot}`);
  }

  if (realResolved.includes(`${path.sep}node_modules${path.sep}`)) {
    throw new Error(`Module resolves into node_modules: ${realResolved}`);
  }

  return realResolved;
}

function traverseRuntimeClosure(packageRoot, entrypoints) {
  const distRoot = path.resolve(packageRoot, 'dist');
  if (!fs.existsSync(distRoot)) {
    throw new Error(`dist directory does not exist at ${distRoot}; run npm run build first`);
  }
  assertNoSymlinkAncestors(distRoot);
  const realDistRoot = fs.realpathSync(distRoot);

  const visited = new Set();
  const queue = entrypoints.map((ep) => {
    const full = path.resolve(packageRoot, ep);
    if (!fs.existsSync(full)) {
      throw new Error(`Entrypoint does not exist: ${full}`);
    }
    assertNoSymlinkAncestors(full);
    return fs.realpathSync(full);
  });

  while (queue.length > 0) {
    const current = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);

    const sourceText = fs.readFileSync(current, 'utf8');
    const specifiers = extractSpecifiersFromAst(current, sourceText);

    for (const specifier of specifiers) {
      const nextFile = resolveAndValidateSpecifier(specifier, current, distRoot, realDistRoot);
      if (nextFile && !visited.has(nextFile)) queue.push(nextFile);
    }
  }

  return Array.from(visited).map((p) => path.relative(packageRoot, p).replace(/\\/gu, '/'));
}

function validateVscodeCompanionClosure(packageRoot) {
  const companionDescPath = path.join(packageRoot, '.evcrate', 'targets', 'vscode', 'files', 'evcrate', 'companion', 'package.json');
  if (!fs.existsSync(companionDescPath)) {
    throw new Error(`Required VS Code companion descriptor missing at ${companionDescPath}`);
  }
  const desc = JSON.parse(fs.readFileSync(companionDescPath, 'utf8'));
  const vsixPath = path.join(packageRoot, '.evcrate', 'targets', 'vscode', 'files', 'evcrate', 'companion', `evcrate-model-bindings-${desc.version}.vsix`);
  if (!fs.existsSync(vsixPath)) {
    throw new Error(`Required companion VSIX missing at ${vsixPath}`);
  }

  const vsixBuffer = fs.readFileSync(vsixPath);
  const actualHash = crypto.createHash('sha256').update(vsixBuffer).digest('hex');
  if (actualHash !== desc.vsixSha256) {
    throw new Error(`Companion VSIX sha256 mismatch in closure check: expected ${desc.vsixSha256}, got ${actualHash}`);
  }

  const jsFilesToCheck = [];
  let eocdOffset = -1;
  for (let i = vsixBuffer.length - 22; i >= Math.max(0, vsixBuffer.length - 65557); i -= 1) {
    if (vsixBuffer.readUInt32LE(i) === 0x06054b50) { eocdOffset = i; break; }
  }
  if (eocdOffset === -1) {
    throw new Error(`Invalid companion VSIX: EOCD not found`);
  }

  const cdOffset = vsixBuffer.readUInt32LE(eocdOffset + 16);
  const cdSize = vsixBuffer.readUInt32LE(eocdOffset + 12);
  const recordCount = vsixBuffer.readUInt16LE(eocdOffset + 8);
  if (cdOffset + cdSize > eocdOffset) {
    throw new Error(`Invalid companion VSIX: Central directory overflows EOCD`);
  }

  let curr = cdOffset;
  for (let i = 0; i < recordCount && curr + 46 <= cdOffset + cdSize; i += 1) {
    if (vsixBuffer.readUInt32LE(curr) !== 0x02014b50) {
      throw new Error(`Invalid Central Directory header signature in companion VSIX`);
    }
    const method = vsixBuffer.readUInt16LE(curr + 10);
    const compSize = vsixBuffer.readUInt32LE(curr + 20);
    const nameLen = vsixBuffer.readUInt16LE(curr + 28);
    const extraLen = vsixBuffer.readUInt16LE(curr + 30);
    const commentLen = vsixBuffer.readUInt16LE(curr + 32);
    const localOff = vsixBuffer.readUInt32LE(curr + 42);
    const entryName = vsixBuffer.subarray(curr + 46, curr + 46 + nameLen).toString('utf8');
    curr += 46 + nameLen + extraLen + commentLen;

    if (entryName.startsWith('extension/dist/') && entryName.endsWith('.js')) {
      if (localOff + 30 > vsixBuffer.length) {
        throw new Error(`Local header for ${entryName} overflows buffer`);
      }
      const localNameLen = vsixBuffer.readUInt16LE(localOff + 26);
      const localExtraLen = vsixBuffer.readUInt16LE(localOff + 28);
      const dataOff = localOff + 30 + localNameLen + localExtraLen;
      if (dataOff + compSize > vsixBuffer.length) {
        throw new Error(`Compressed data for ${entryName} overflows buffer`);
      }
      const compData = vsixBuffer.subarray(dataOff, dataOff + compSize);
      const data = method === 0 ? compData : zlib.inflateRawSync(compData, { maxOutputLength: 16 * 1024 * 1024 });
      jsFilesToCheck.push({ name: entryName, content: data.toString('utf8') });
    }
  }

  if (jsFilesToCheck.length === 0) {
    throw new Error(`No JS files found in companion VSIX`);
  }
  for (const { name, content } of jsFilesToCheck) {
    const specifiers = extractSpecifiersFromAst(name, content);
    for (const spec of specifiers) {
      if (spec.startsWith('node:') || spec === 'vscode') continue;
      if (moduleBuiltin.isBuiltin(spec)) continue;
      if (spec.startsWith('.')) continue;
      throw new Error(`Forbidden external module "${spec}" in companion ${name}`);
    }
  }
  return { valid: true, companionVerified: true, filesChecked: jsFilesToCheck.length };
}

function validateRuntimeClosure(packageRoot) {
  const entrypoints = ['dist/cli/evcrate.js', 'dist/index.js'];
  const visited = traverseRuntimeClosure(packageRoot, entrypoints);
  const companion = validateVscodeCompanionClosure(packageRoot);

  return {
    valid: true,
    entrypoints,
    visitedCount: visited.length,
    visited,
    companion
  };
}

module.exports = {
  assertNoSymlinkAncestors,
  extractSpecifiersFromAst,
  resolveAndValidateSpecifier,
  traverseRuntimeClosure,
  validateRuntimeClosure,
  validateVscodeCompanionClosure
};
