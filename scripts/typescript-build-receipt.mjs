/**
 * scripts/typescript-build-receipt.mjs
 *
 * Compiler-owned output receipt management for TypeScript builds.
 * Tracks emitted files beside the build info cache and safely removes
 * obsolete artifacts when sources are renamed or deleted without sweeping directories.
 */

import { resolve, relative, dirname, isAbsolute, parse, sep } from 'node:path';
import fs from 'node:fs';

/**
 * Normalizes a path string to POSIX format (forward slashes).
 *
 * @param {string} filePath - Path to normalize
 * @returns {string} Normalized POSIX path
 */
export function toPosixPath(filePath) {
  return filePath.replace(/\\/g, '/');
}

/**
 * Validates that childPath is strictly within parentDir and does not escape or match parentDir.
 *
 * @param {string} childPath - Target path to test
 * @param {string} parentDir - Enclosing directory
 * @returns {boolean} True if childPath is strictly inside parentDir
 */
export function isStrictlyInside(childPath, parentDir) {
  const rel = relative(parentDir, childPath);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

/**
 * Validates that childPath is physically and strictly within an allowed output directory,
 * without traversing any symbolic links in any path component or escaping via symlink ancestors.
 *
 * @param {string} fullPath - Absolute target path to test
 * @param {string|string[]} allowedDirs - One or more allowed output directories
 * @returns {{ safe: boolean, notFound?: boolean, reason?: string, matchedDir?: string }}
 */
export function isSafeOutputPath(fullPath, allowedDirs) {
  const dirs = (Array.isArray(allowedDirs) ? allowedDirs : [allowedDirs]).filter(Boolean);
  if (dirs.length === 0) {
    return { safe: false, reason: 'No output directory configured' };
  }

  const matchedDir = dirs.find((d) => isStrictlyInside(fullPath, d));
  if (!matchedDir) {
    return { safe: false, reason: `Skipping unsafe path outside output directory: ${fullPath}` };
  }

  // Checking descendants alone misses a linked output root or its ancestors.
  let ancestor = parse(resolve(matchedDir)).root;
  for (const part of resolve(matchedDir).slice(ancestor.length).split(sep).filter(Boolean)) {
    ancestor = resolve(ancestor, part);
    try {
      const stat = fs.lstatSync(ancestor);
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        return { safe: false, reason: `Refusing unsafe output directory ancestor: ${ancestor}` };
      }
    } catch (err) {
      return { safe: false, notFound: err.code === 'ENOENT', reason: err.message };
    }
  }
  let realOutDir;
  try {
    realOutDir = fs.realpathSync.native ? fs.realpathSync.native(matchedDir) : fs.realpathSync(matchedDir);
  } catch (err) {
    return { safe: false, reason: `Output directory cannot be physically resolved: ${err.message}` };
  }

  const relFromOutDir = relative(matchedDir, fullPath);
  const parts = relFromOutDir.split(/[/\\]/);
  let current = matchedDir;

  for (let i = 0; i < parts.length; i++) {
    current = resolve(current, parts[i]);
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch (err) {
      if (err.code === 'ENOENT') {
        return { safe: false, notFound: true, reason: 'Path component does not exist' };
      }
      return { safe: false, reason: `Failed to stat ${current}: ${err.message}` };
    }

    if (stat.isSymbolicLink()) {
      const isLeaf = (i === parts.length - 1);
      return {
        safe: false,
        reason: isLeaf
          ? `Refusing to remove symlink from receipt: ${toPosixPath(relative(process.cwd(), fullPath))}`
          : `Refusing to traverse symlink ancestor: ${toPosixPath(relative(process.cwd(), current))}`,
      };
    }
  }

  try {
    const realParent = fs.realpathSync.native ? fs.realpathSync.native(dirname(fullPath)) : fs.realpathSync(dirname(fullPath));
    const relPhysical = relative(realOutDir, realParent);
    if (relPhysical.startsWith('..') || isAbsolute(relPhysical)) {
      return { safe: false, reason: `Physical location escapes output root: ${fullPath}` };
    }
  } catch (err) {
    return { safe: false, reason: `Failed to verify physical containment: ${err.message}` };
  }

  return { safe: true, matchedDir };
}

/**
 * Validates and safely cleans stale outputs recorded in a previous receipt.
 * Never sweeps outDir, never deletes files outside outDir, and never follows symlinks.
 *
 * @param {string|null} receiptPath - Path to the receipt JSON file
 * @param {Set<string>} currentOutputsSet - Set of expected relative output paths in current compilation
 * @param {string|null} outDir - Absolute path to the configured output directory
 * @param {string} root - Project root directory
 * @param {string|null} [declarationDir] - Optional absolute path to declaration output directory
 * @returns {{ cleaned: string[], errors: string[], uncleaned: string[] }} Results of the cleanup operation
 */
export function cleanStaleOutputs(receiptPath, currentOutputsSet, outDir, root, declarationDir = null) {
  if (!receiptPath || !fs.existsSync(receiptPath) || !outDir) {
    return { cleaned: [], errors: [], uncleaned: [] };
  }

  const cleaned = [];
  const errors = [];
  const uncleaned = [];

  let data;
  try {
    const raw = fs.readFileSync(receiptPath, 'utf8');
    data = JSON.parse(raw);
  } catch (err) {
    return {
      cleaned: [],
      errors: [`Failed to process receipt at ${receiptPath}: ${err.message}`],
      uncleaned: [],
    };
  }

  // Strict schema validation
  if (data?.version !== 1 || !Array.isArray(data.outputs) || typeof data.outDir !== 'string') {
    return {
      cleaned: [],
      errors: ['Invalid receipt format: missing required schema version 1 fields'],
      uncleaned: [],
    };
  }

  const allowedOutDirs = [resolve(root, outDir)];
  if (declarationDir) {
    allowedOutDirs.push(resolve(root, declarationDir));
  }

  const previousOutDir = resolve(root, data.outDir);
  if (previousOutDir !== resolve(root, outDir)) {
    return {
      cleaned: [],
      errors: ['Receipt outDir mismatch with current compiler configuration'],
      uncleaned: [...data.outputs],
    };
  }

  for (const prevRelPath of data.outputs) {
    if (typeof prevRelPath !== 'string') continue;

    // If the file is still expected in current compilation, do not delete it
    if (currentOutputsSet.has(prevRelPath)) continue;

    const fullPath = resolve(root, prevRelPath);

    // Validate physical and ancestor symlink safety
    const safety = isSafeOutputPath(fullPath, allowedOutDirs);
    if (!safety.safe) {
      if (safety.notFound) {
        // Output already absent from disk; nothing to clean
        continue;
      }
      errors.push(safety.reason);
      // Retain ownership evidence for outputs that could not be safely unlinked
      uncleaned.push(prevRelPath);
      continue;
    }

    try {
      const stat = fs.lstatSync(fullPath);
      if (stat.isFile()) {
        fs.unlinkSync(fullPath);
        cleaned.push(prevRelPath);
      } else {
        errors.push(`Refusing to remove non-file artifact from receipt: ${prevRelPath}`);
        uncleaned.push(prevRelPath);
      }
    } catch (err) {
      errors.push(`Failed to unlink stale file ${prevRelPath}: ${err.message}`);
      uncleaned.push(prevRelPath);
    }
  }

  return { cleaned, errors, uncleaned };
}

/**
 * Atomically writes the compiler-owned output receipt beside the cache.
 *
 * @param {string|null} receiptPath - Destination path for the receipt JSON file
 * @param {string} configPath - Path to the tsconfig file
 * @param {string|null} relativeOutDir - Relative path to the output directory
 * @param {string[]|Set<string>} outputs - List of relative output paths emitted
 * @param {string} root - Project root directory
 * @param {string|null} [relativeDeclarationDir] - Optional relative declaration directory
 */
export function writeReceipt(receiptPath, configPath, relativeOutDir, outputs, root, relativeDeclarationDir = null) {
  if (!receiptPath) return;

  const payload = {
    version: 1,
    config: toPosixPath(relative(root, resolve(root, configPath))),
    outDir: relativeOutDir,
    declarationDir: relativeDeclarationDir || null,
    timestamp: new Date().toISOString(),
    outputs: Array.from(outputs).sort(),
  };

  fs.mkdirSync(dirname(receiptPath), { recursive: true });
  const tempPath = `${receiptPath}.tmp.${Date.now()}`;
  fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  fs.renameSync(tempPath, receiptPath);
}
