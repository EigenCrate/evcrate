/**
 * scripts/typescript-build-receipt.mjs
 *
 * Compiler-owned output receipt management for TypeScript builds.
 * Tracks emitted files beside the build info cache and safely removes
 * obsolete artifacts when sources are renamed or deleted without sweeping directories.
 */

import { resolve, relative, dirname, isAbsolute } from 'node:path';
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
 * Validates and safely cleans stale outputs recorded in a previous receipt.
 * Never sweeps outDir, never deletes files outside outDir, and never follows symlinks.
 *
 * @param {string|null} receiptPath - Path to the receipt JSON file
 * @param {Set<string>} currentOutputsSet - Set of expected relative output paths in current compilation
 * @param {string|null} outDir - Absolute path to the configured output directory
 * @param {string} root - Project root directory
 * @returns {{ cleaned: string[], errors: string[] }} Results of the cleanup operation
 */
export function cleanStaleOutputs(receiptPath, currentOutputsSet, outDir, root) {
  if (!receiptPath || !fs.existsSync(receiptPath) || !outDir) {
    return { cleaned: [], errors: [] };
  }

  const cleaned = [];
  const errors = [];

  try {
    const raw = fs.readFileSync(receiptPath, 'utf8');
    const data = JSON.parse(raw);

    // Strict schema validation
    if (data?.version !== 1 || !Array.isArray(data.outputs) || typeof data.outDir !== 'string') {
      return { cleaned: [], errors: ['Invalid receipt format: missing required schema version 1 fields'] };
    }

    const previousOutDir = resolve(root, data.outDir);
    if (previousOutDir !== resolve(root, outDir)) {
      return { cleaned: [], errors: ['Receipt outDir mismatch with current compiler configuration'] };
    }

    for (const prevRelPath of data.outputs) {
      if (typeof prevRelPath !== 'string') continue;

      // If the file is still expected in current compilation, do not delete it
      if (currentOutputsSet.has(prevRelPath)) continue;

      const fullPath = resolve(root, prevRelPath);

      // Strict boundary check: must be strictly inside outDir
      if (!isStrictlyInside(fullPath, outDir)) {
        errors.push(`Skipping unsafe path outside outDir in receipt: ${prevRelPath}`);
        continue;
      }

      if (fs.existsSync(fullPath)) {
        try {
          const stat = fs.lstatSync(fullPath);
          if (stat.isSymbolicLink()) {
            errors.push(`Refusing to remove symlink from receipt: ${prevRelPath}`);
            continue;
          }
          if (stat.isFile()) {
            fs.unlinkSync(fullPath);
            cleaned.push(prevRelPath);
          }
        } catch (err) {
          errors.push(`Failed to unlink stale file ${prevRelPath}: ${err.message}`);
        }
      }
    }
  } catch (err) {
    errors.push(`Failed to process receipt at ${receiptPath}: ${err.message}`);
  }

  return { cleaned, errors };
}

/**
 * Atomically writes the compiler-owned output receipt beside the cache.
 *
 * @param {string|null} receiptPath - Destination path for the receipt JSON file
 * @param {string} configPath - Path to the tsconfig file
 * @param {string|null} relativeOutDir - Relative path to the output directory
 * @param {string[]|Set<string>} outputs - List of relative output paths emitted
 * @param {string} root - Project root directory
 */
export function writeReceipt(receiptPath, configPath, relativeOutDir, outputs, root) {
  if (!receiptPath) return;

  const payload = {
    version: 1,
    config: toPosixPath(relative(root, resolve(root, configPath))),
    outDir: relativeOutDir,
    timestamp: new Date().toISOString(),
    outputs: Array.from(outputs).sort(),
  };

  fs.mkdirSync(dirname(receiptPath), { recursive: true });
  const tempPath = `${receiptPath}.tmp.${Date.now()}`;
  fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  fs.renameSync(tempPath, receiptPath);
}
