'use strict';

/**
 * @file runtime-closure.cjs
 * Transitive runtime closure walker and verifier for EVCrate Advisor Plugin (Phase E04).
 */

const fs = require('node:fs');
const path = require('node:path');
const { extractSpecifiersFromAst } = require('../release/ast-scanner.cjs');
const { APPROVED_NODE_BUILTINS, FORBIDDEN_NODE_BUILTINS } = require('./closure-policy.cjs');

function assertNoSymlinkAncestors(targetPath) {
  let current = path.resolve(targetPath);
  while (true) {
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) {
      throw new Error(`Symbolic link forbidden in plugin closure: ${current}`);
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

function resolvePluginModuleSpecifier(specifier, currentFile, pluginRoot, realPluginRoot) {
  if (specifier.startsWith('node:')) {
    if (FORBIDDEN_NODE_BUILTINS.has(specifier)) {
      throw new Error(`Forbidden node: built-in "${specifier}" in ${currentFile}`);
    }
    if (!APPROVED_NODE_BUILTINS.has(specifier)) {
      throw new Error(`Unapproved node: built-in "${specifier}" in ${currentFile}`);
    }
    return null;
  }

  if (!specifier.startsWith('.')) {
    if (specifier === '@dam-hopper/plugin-sdk' || specifier.startsWith('@dam-hopper/plugin-sdk/')) {
      const sdkDir = path.join(pluginRoot, 'node_modules', '@dam-hopper', 'plugin-sdk');
      if (!fs.existsSync(sdkDir)) throw new Error(`Pinned SDK missing at ${sdkDir}`);
      const subpath = specifier === '@dam-hopper/plugin-sdk'
        ? 'dist/index.js'
        : specifier.replace('@dam-hopper/plugin-sdk/', 'dist/') + (specifier.endsWith('.js') ? '' : '.js');
      const resolvedSdk = path.resolve(sdkDir, subpath);
      if (!fs.existsSync(resolvedSdk)) throw new Error(`Cannot resolve SDK entry "${specifier}" from ${currentFile}`);
      return fs.realpathSync(resolvedSdk);
    }
    throw new Error(`Bare specifier "${specifier}" forbidden in plugin closure (in ${currentFile})`);
  }

  const candidateBase = path.resolve(path.dirname(currentFile), specifier);
  let resolved = candidateBase;

  if (!fs.existsSync(resolved)) {
    if (fs.existsSync(`${resolved}.cjs`)) resolved = `${resolved}.cjs`;
    else if (fs.existsSync(`${resolved}.js`)) resolved = `${resolved}.js`;
    else if (fs.existsSync(`${resolved}.json`)) resolved = `${resolved}.json`;
  }

  if (!fs.existsSync(resolved)) throw new Error(`Unresolved relative module "${specifier}" from ${currentFile}`);

  assertNoSymlinkAncestors(resolved);
  const stat = fs.lstatSync(resolved);
  if (stat.isDirectory()) {
    const indexCjs = path.join(resolved, 'index.cjs');
    const indexJs = path.join(resolved, 'index.js');
    if (fs.existsSync(indexCjs)) resolved = indexCjs;
    else if (fs.existsSync(indexJs)) resolved = indexJs;
    else throw new Error(`Directory module "${specifier}" missing index file: ${resolved}`);
    assertNoSymlinkAncestors(resolved);
  } else if (!stat.isFile()) {
    throw new Error(`Module must be a regular file: ${resolved}`);
  }

  if (resolved.endsWith('.node')) throw new Error(`Native addon (.node) forbidden in plugin closure: ${resolved}`);

  const realResolved = fs.realpathSync(resolved);
  if (!realResolved.startsWith(`${realPluginRoot}${path.sep}`) && realResolved !== realPluginRoot) {
    throw new Error(`Module ${realResolved} escapes plugin boundary ${realPluginRoot}`);
  }
  return realResolved;
}

function traversePluginRuntimeClosure(pluginRoot, entrypoints = ['backend/worker.cjs']) {
  assertNoSymlinkAncestors(pluginRoot);
  const realPluginRoot = fs.realpathSync(pluginRoot);

  const visited = new Set();
  const queue = entrypoints.map((ep) => {
    const full = path.resolve(pluginRoot, ep);
    if (!fs.existsSync(full)) throw new Error(`Plugin entrypoint missing: ${full}`);
    assertNoSymlinkAncestors(full);
    return fs.realpathSync(full);
  });

  while (queue.length > 0) {
    const current = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);

    if (current.endsWith('.json')) continue;

    const sourceText = fs.readFileSync(current, 'utf8');
    const specifiers = extractSpecifiersFromAst(current, sourceText);

    for (const specifier of specifiers) {
      const nextFile = resolvePluginModuleSpecifier(specifier, current, pluginRoot, realPluginRoot);
      if (nextFile && !visited.has(nextFile)) queue.push(nextFile);
    }
  }

  return Array.from(visited).map((p) => path.relative(pluginRoot, p).replace(/\\/gu, '/')).sort();
}

function validatePluginRuntimeClosure(pluginRoot) {
  const visited = traversePluginRuntimeClosure(pluginRoot);
  for (const rel of visited) {
    if (rel.endsWith('.test.js') || rel.endsWith('.test.cjs') || rel.endsWith('.map') || rel.endsWith('.ts')) {
      throw new Error(`Dev/test artifact leaked into plugin runtime closure: ${rel}`);
    }
    if (rel.includes('/fixtures/')) {
      throw new Error(`Fixture file leaked into plugin runtime closure: ${rel}`);
    }
  }
  return { valid: true, visitedCount: visited.length, visited };
}

module.exports = {
  APPROVED_NODE_BUILTINS,
  FORBIDDEN_NODE_BUILTINS,
  resolvePluginModuleSpecifier,
  traversePluginRuntimeClosure,
  validatePluginRuntimeClosure
};
