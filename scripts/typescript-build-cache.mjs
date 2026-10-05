/**
 * scripts/typescript-build-cache.mjs
 *
 * TypeScript build configuration and cache validation utilities.
 * Uses public TypeScript APIs to inspect expected output paths and detect
 * corrupt caches or deleted outputs that require cache invalidation.
 */

import { dirname, join, relative, resolve } from 'node:path';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { toPosixPath } from './typescript-build-receipt.mjs';

/**
 * Reads and parses a tsconfig file using public TypeScript APIs.
 *
 * @param {string} configPath - Path to the tsconfig file
 * @param {string} root - Project root directory
 * @returns {{ parsed: ts.ParsedCommandLine, absoluteConfigPath: string }} Parsed configuration
 */
export function parseTsConfig(configPath, root, extraArgs = []) {
  const absoluteConfigPath = resolve(root, configPath);
  if (!fs.existsSync(absoluteConfigPath)) {
    throw new Error(`Config file not found: ${absoluteConfigPath}`);
  }

  const configFile = ts.readConfigFile(absoluteConfigPath, ts.sys.readFile);
  if (configFile.error) {
    const message = ts.formatDiagnostics([configFile.error], {
      getCurrentDirectory: () => root,
      getCanonicalFileName: (f) => f,
      getNewLine: () => '\n',
    });
    throw new Error(`Failed to read tsconfig: ${message}`);
  }

  const cmd = extraArgs && extraArgs.length > 0
    ? ts.parseCommandLine(extraArgs)
    : { options: {}, errors: [] };
  // CLI paths are relative to the compiler's working directory, not the config directory.
  for (const key of ['outDir', 'rootDir', 'declarationDir', 'tsBuildInfoFile', 'baseUrl']) {
    if (cmd.options[key]) cmd.options[key] = resolve(root, cmd.options[key]);
  }
  for (const key of ['rootDirs', 'typeRoots']) {
    if (cmd.options[key]) cmd.options[key] = cmd.options[key].map((path) => resolve(root, path));
  }

  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    dirname(absoluteConfigPath),
    cmd.options,
    absoluteConfigPath
  );
  const errors = [...cmd.errors, ...parsed.errors];
  if (errors.length > 0) {
    throw new Error(ts.formatDiagnostics(errors, {
      getCurrentDirectory: () => root,
      getCanonicalFileName: (file) => file,
      getNewLine: () => '\n',
    }));
  }

  return { parsed, absoluteConfigPath };
}

/**
 * Resolves the expected output files and cache/receipt paths for a given config.
 *
 * @param {string} configPath - Path to tsconfig
 * @param {string} root - Project root directory
 * @returns {object} Resolved configuration metadata
 */
export function resolveConfigOutputs(configPath, root, extraArgs = []) {
  const { parsed, absoluteConfigPath } = parseTsConfig(configPath, root, extraArgs);
  const outDir = parsed.options.outDir ? resolve(root, parsed.options.outDir) : null;
  const declarationDir = parsed.options.declarationDir ? resolve(root, parsed.options.declarationDir) : null;

  // Expected output code and declaration files computed using TypeScript public API
  const expectedOutputs = [];

  // When noEmit is active, compiler produces no output files
  if (!parsed.options.noEmit) {
    const program = ts.createProgram({
      rootNames: parsed.fileNames,
      options: parsed.options,
      projectReferences: parsed.projectReferences,
      configFileParsingDiagnostics: parsed.errors,
    });
    const emitEligibleSourceFiles = program.getSourceFiles()
      .filter((source) => !source.isDeclarationFile && !program.isSourceFileFromExternalLibrary(source))
      .map((source) => source.fileName);

    const emitCommandLine = { ...parsed, fileNames: emitEligibleSourceFiles };
    const ignoreCase = !ts.sys.useCaseSensitiveFileNames;

    for (const fileName of emitEligibleSourceFiles) {
      const outputs = ts.getOutputFileNames(emitCommandLine, fileName, ignoreCase);
      for (const out of outputs) {
        const rel = toPosixPath(relative(root, resolve(root, out)));
        expectedOutputs.push(rel);
      }
    }
  }

  // Build info path
  let tsBuildInfoPath = null;
  if (parsed.options.tsBuildInfoFile) {
    tsBuildInfoPath = resolve(root, parsed.options.tsBuildInfoFile);
  } else if (parsed.options.incremental && typeof ts.getTsBuildInfoEmitOutputFilePath === 'function') {
    const computed = ts.getTsBuildInfoEmitOutputFilePath(parsed.options);
    if (computed) tsBuildInfoPath = resolve(root, computed);
  }

  // Receipt path beside the tsBuildInfo file (or beside outDir if no buildinfo)
  let receiptPath = null;
  if (tsBuildInfoPath) {
    receiptPath = `${tsBuildInfoPath}.receipt.json`;
  } else if (outDir) {
    const sanitizedName = toPosixPath(relative(root, absoluteConfigPath)).replace(/\//g, '_');
    receiptPath = join(root, '.cache', 'evcrate', `${sanitizedName}.receipt.json`);
  }
  const cliOptions = ts.parseCommandLine(extraArgs).options;
  if (receiptPath && (cliOptions.outDir || cliOptions.declarationDir)) {
    const identity = createHash('sha256').update(JSON.stringify([outDir, declarationDir])).digest('hex').slice(0, 16);
    receiptPath = `${receiptPath}.${identity}`;
  }

  return {
    parsed,
    absoluteConfigPath,
    outDir,
    relativeOutDir: outDir ? toPosixPath(relative(root, outDir)) : null,
    declarationDir,
    relativeDeclarationDir: declarationDir ? toPosixPath(relative(root, declarationDir)) : null,
    expectedOutputs: Array.from(new Set(expectedOutputs)).sort(),
    tsBuildInfoPath,
    receiptPath,
  };
}

/**
 * Checks if the tsBuildInfo cache is present but corrupted (empty or invalid JSON).
 *
 * @param {string|null} tsBuildInfoPath - Path to the build info file
 * @returns {boolean} True if corrupted
 */
export function isBuildInfoCorrupt(tsBuildInfoPath) {
  if (!tsBuildInfoPath || !fs.existsSync(tsBuildInfoPath)) return false;
  try {
    const stat = fs.statSync(tsBuildInfoPath);
    if (stat.size === 0) return true;
    const content = fs.readFileSync(tsBuildInfoPath, 'utf8');
    JSON.parse(content);
    return false;
  } catch {
    return true;
  }
}

/**
 * Validates cache state and forces invalidation when outputs are missing or cache is corrupted.
 *
 * @param {object} info - Output metadata from resolveConfigOutputs
 * @param {string} root - Project root directory
 * @param {object} logger - Logger interface
 * @returns {{ invalidated: boolean, reason: string|null }} Invalidation status
 */
export function validateAndInvalidateCache(info, root, logger = console) {
  if (!info.tsBuildInfoPath || !fs.existsSync(info.tsBuildInfoPath)) {
    return { invalidated: false, reason: null };
  }

  // 1. Check for corrupt cache file
  if (isBuildInfoCorrupt(info.tsBuildInfoPath)) {
    logger.warn(`[build-typescript] Corrupted build info detected at ${info.tsBuildInfoPath}; invalidating.`);
    fs.rmSync(info.tsBuildInfoPath, { force: true });
    return { invalidated: true, reason: 'corrupt_build_info' };
  }
  // If noEmit is configured, skip missing output validation since no outputs are produced
  if (info.parsed?.options?.noEmit) {
    return { invalidated: false, reason: null };
  }


  // 2. Check for missing expected outputs
  let missingCount = 0;
  for (const expectedRel of info.expectedOutputs) {
    const full = resolve(root, expectedRel);
    if (!fs.existsSync(full)) {
      missingCount++;
    }
  }

  if (missingCount > 0) {
    // Force re-emission by removing stale build info
    fs.rmSync(info.tsBuildInfoPath, { force: true });
    return { invalidated: true, reason: `missing_outputs_${missingCount}` };
  }

  return { invalidated: false, reason: null };
}
