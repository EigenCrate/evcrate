'use strict';

const fs = require('node:fs');
const path = require('node:path');
const moduleBuiltin = require('node:module');
const { extractSpecifiersFromAst } = require('./ast-scanner.cjs');

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

function validateRuntimeClosure(packageRoot) {
  const entrypoints = ['dist/cli/evcrate.js', 'dist/index.js'];
  const visited = traverseRuntimeClosure(packageRoot, entrypoints);

  const controllerValidatorPath = path.join(packageRoot, 'dist', 'manifests', 'controller.js');
  if (!fs.existsSync(controllerValidatorPath)) {
    throw new Error(`Controller validator authority missing: ${controllerValidatorPath}`);
  }
  const controllerRoot = path.join(packageRoot, '.evcrate', 'source', '.evcrate', 'bin');
  if (!fs.existsSync(controllerRoot)) {
    throw new Error(`Controller root missing: ${controllerRoot}`);
  }
  assertNoSymlinkAncestors(controllerRoot);

  const { validateAdvisorControllerSource } = require(controllerValidatorPath);
  validateAdvisorControllerSource(controllerRoot);

  return {
    valid: true,
    entrypoints,
    visitedCount: visited.length,
    visited
  };
}

module.exports = {
  assertNoSymlinkAncestors,
  extractSpecifiersFromAst,
  resolveAndValidateSpecifier,
  traverseRuntimeClosure,
  validateRuntimeClosure
};
