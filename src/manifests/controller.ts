import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { assertNoSymlinkAncestors, assertRealDirectory, assertRegularFile } from '../filesystem/paths.js';
import { canonicalJsonBytes, hashFile, isIgnoredArtifact } from '../filesystem/hashing.js';
import {
  ADVISOR_CONTROLLER_FILES,
  ADVISOR_CONTROLLER_BINARY_FILES,
  ADVISOR_CONTROLLER_TEXT_DATA_FILES,
  ADVISOR_CONTROLLER_NODE_BUILTINS
} from './controller-inventory.generated.js';

export {
  ADVISOR_CONTROLLER_FILES,
  ADVISOR_CONTROLLER_BINARY_FILES,
  ADVISOR_CONTROLLER_TEXT_DATA_FILES
};
const IS_BINARY_FILE: Record<string, true> = Object.freeze(
  Object.fromEntries(ADVISOR_CONTROLLER_BINARY_FILES.map((f) => [f, true as const]))
);
const IS_TEXT_DATA_FILE: Record<string, true> = Object.freeze(
  Object.fromEntries(ADVISOR_CONTROLLER_TEXT_DATA_FILES.map((f) => [f, true as const]))
);
const FORBIDDEN_PARTS = new Set(['__tests__', 'tests', 'fixtures', 'helpers']);
const FORBIDDEN_SUFFIXES = ['.test.cjs', '.test.js', '.test.mjs', '.test.py', '.spec.cjs', '.spec.js'];
const NODE_BUILTINS = new Set<string>(ADVISOR_CONTROLLER_NODE_BUILTINS);
const REQUIRE_CALL = /(?<![\w$.])require\s*\(/gu;
const LITERAL_REQUIRE = /(?<![\w$.])require\s*\(\s*(['"])([^'"]+)\1\s*\)/gu;
function fail(): never { throw new ControlPlaneError('PATH_UNSAFE'); }
function isProduction(relativePath: string): boolean {
  const parts = relativePath.split('/');
  const name = parts.at(-1) ?? '';
  return parts.some((part) => FORBIDDEN_PARTS.has(part)) || name.startsWith('fake-')
    || FORBIDDEN_SUFFIXES.some((suffix) => name.endsWith(suffix));
}
function closure(root: string): void {
  const allowed = new Set<string>(ADVISOR_CONTROLLER_FILES);
  const rootPath = resolve(root);
  for (const entry of ADVISOR_CONTROLLER_FILES) {
    const path = join(root, entry);

    if (IS_BINARY_FILE[entry]) {
      // Binary native assets (.node) are validated by checking non-empty Mach-O format
      assertRegularFile(path);
      const buf = readFileSync(path);
      if (buf.length < 4) fail();
      const magic = buf.readUInt32LE(0);
      if (magic !== 0xfeedfacf) fail();
      continue;
    }

    let source: string;
    try {
      source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(readFileSync(path));
    } catch {
      fail();
    }
    if (source.startsWith('\uFEFF')) fail();

    if (IS_TEXT_DATA_FILE[entry]) {
      // Native text assets (.cs, .ps1, .c, .h, .json) are owned text data, not JavaScript modules.
      continue;
    }

    if (entry !== 'evcrate-advisor' && entry !== 'evcrate-advice-mode'
      && !entry.endsWith('.cjs') && !entry.endsWith('.js')) {
      fail();
    }

    const literals = new Map<number, string>();
    for (const match of source.matchAll(LITERAL_REQUIRE)) literals.set(match.index ?? -1, match[2]);
    for (const call of source.matchAll(REQUIRE_CALL)) {
      const specifier = literals.get(call.index ?? -1);
      if (!specifier) fail();
      const module = specifier.startsWith('node:') ? specifier.slice(5) : specifier;
      if (!specifier.startsWith('.')) {
        if (!NODE_BUILTINS.has(module)) fail();
        continue;
      }
      const importedPath = resolve(dirname(path), specifier);
      const imported = relative(rootPath, importedPath).split('\\').join('/');
      if (!imported || imported === '..' || imported.startsWith('../') || !allowed.has(imported)
        || IS_TEXT_DATA_FILE[imported]) fail();
      if (IS_BINARY_FILE[imported] && entry !== 'lib/advisor/darwin-platform.cjs') fail();
    }
  }
}
function validateRoot(root: string): void {
  assertNoSymlinkAncestors(root);
  assertRealDirectory(root);
  const allowed = new Set<string>(ADVISOR_CONTROLLER_FILES);
  const directories = new Set<string>();
  for (const entry of ADVISOR_CONTROLLER_FILES) {
    let parent = dirname(entry).split('\\').join('/');
    while (parent !== '.') { directories.add(parent); parent = dirname(parent).split('\\').join('/'); }
  }
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const name = relative(root, path).split('\\').join('/');
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) fail();
      if (stat.isDirectory()) {
        if (!directories.has(name)) fail();
        visit(path);
      } else if (!stat.isFile() || !allowed.has(name) || isProduction(name) || isIgnoredArtifact(name)) fail();
    }
  };
  visit(root);
}
export function validateAdvisorControllerSource(root: string): void {
  validateRoot(root);
  for (const entry of ADVISOR_CONTROLLER_FILES) assertRegularFile(join(root, entry));
  closure(root);
  for (const entrypoint of ['evcrate-advisor', 'evcrate-advice-mode']) {
    if (readFileSync(join(root, entrypoint), 'utf8').split('\n')[0] !== '#!/usr/bin/env node') fail();
  }
}
export function controllerHashes(root: string): Record<string, string> {
  validateAdvisorControllerSource(root);
  return Object.fromEntries(ADVISOR_CONTROLLER_FILES.map((entry) => [`.evcrate/bin/${entry}`, hashFile(join(root, entry))]));
}
export function renderAdvisorControllerMetadata(): Record<string, unknown> {
  return { schema: 'evcrate-advisor-controller/v1', root: '.evcrate/bin', entrypoint: 'evcrate-advisor', files: [...ADVISOR_CONTROLLER_FILES], parity: 'byte-identical' };
}
export function validateAdvisorControllerProjection(sourceRoot: string, outputRoot: string): Record<string, unknown> {
  validateAdvisorControllerSource(sourceRoot);
  validateRoot(outputRoot);
  for (const entry of ADVISOR_CONTROLLER_FILES) {
    if (!Buffer.from(readFileSync(join(sourceRoot, entry))).equals(Buffer.from(readFileSync(join(outputRoot, entry))))) fail();
  }
  return renderAdvisorControllerMetadata();
}
export function controllerHashBytes(root: string): Uint8Array { return canonicalJsonBytes(controllerHashes(root)); }
