import { chmodSync, lstatSync, mkdirSync, readdirSync, type Dirent, type Stats } from 'node:fs';
import { join, relative } from 'node:path';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { assertStagedRoot } from '../filesystem/atomic.js';
import { readBoundedFile } from '../filesystem/hashing.js';
import { assertNoSymlinkAncestors } from '../filesystem/paths.js';
import {
  bytesEqual,
  contentHash,
  writeProjectionFile
} from './projection-utils.js';
import type {
  ProjectionAdapter,
  ProjectionBuildContext,
  ProjectionValidation,
  ProjectedFileDiagnostic
} from './types.js';
import type { ResourceGraphFile } from './resource-graph.js';

function invalidManifest(): never {
  throw new ControlPlaneError('VALIDATION_INVALID');
}

function claudeRoot(context: ProjectionBuildContext): string {
  if (context.manifest.id !== 'claude' || context.manifest.outputRoots.length !== 1
    || context.manifest.outputRoots[0] !== '.claude') return invalidManifest();
  return context.manifest.outputRoots[0];
}

function absent(path: string): void {
  try {
    lstatSync(path);
    throw new ControlPlaneError('PATH_UNSAFE');
  } catch (error) {
    if (error instanceof ControlPlaneError) throw error;
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new ControlPlaneError('PATH_UNSAFE');
  }
}

function createRoot(context: ProjectionBuildContext, root: string): void {
  const destination = context.stagePath(root);
  assertNoSymlinkAncestors(destination);
  absent(destination);
  try { mkdirSync(destination, { mode: 0o755 }); }
  catch { throw new ControlPlaneError('PATH_UNSAFE'); }
  if (process.platform !== 'win32') {
    try { chmodSync(destination, 0o755); } catch { throw new ControlPlaneError('PATH_UNSAFE'); }
  }
}

function expectedFiles(context: ProjectionBuildContext, root: string): ReadonlyMap<string, ResourceGraphFile> {
  return new Map(context.resources.files.map((file) => [`${root}/${file.path}`, file]));
}
function expectedDirectories(context: ProjectionBuildContext, root: string): ReadonlySet<string> {
  const directories = new Set<string>([root]);
  for (const file of context.resources.files) {
    const segments = file.path.split('/');
    for (let index = 1; index < segments.length; index += 1) {
      directories.add(`${root}/${segments.slice(0, index).join('/')}`);
    }
  }
  return directories;
}

function classify(entry: Dirent, stat: Stats): 'file' | 'directory' {
  if (stat.isDirectory() || entry.isDirectory()) return 'directory';
  return 'file';
}

function readOutputFile(path: string, initial: Stats): Uint8Array {
  try {
    const bytes = readBoundedFile(path, 16 * 1024 * 1024);
    const final = lstatSync(path);
    if (final.isSymbolicLink() || !final.isFile()
      || Number(final.dev) !== Number(initial.dev) || Number(final.ino) !== Number(initial.ino)
      || Number(final.size) !== Number(initial.size)
      || (Number(final.mode) & 0o777) !== (Number(initial.mode) & 0o777)) {
      throw new ControlPlaneError('PATH_UNSAFE');
    }
    return bytes;
  } catch (error) {
    if (error instanceof ControlPlaneError) throw error;
    throw new ControlPlaneError('PATH_UNSAFE');
  }
}

function collectOutput(
  context: ProjectionBuildContext,
  directory: string,
  expected: ReadonlyMap<string, ResourceGraphFile>,
  expectedDirs: ReadonlySet<string>,
  seen: Set<string>,
  diagnostics: ProjectedFileDiagnostic[]
): void {
  let entries: Dirent[];
  try { entries = readdirSync(directory, { withFileTypes: true }); }
  catch {
    diagnostics.push({ path: relative(context.stage.path, directory).split('\\').join('/'), kind: 'directory', code: 'unsafe' });
    return;
  }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    const relativePath = relative(context.stage.path, path).split('\\').join('/');
    let stat: Stats;
    try { stat = lstatSync(path); }
    catch {
      diagnostics.push({ path: relativePath, kind: 'file', code: 'unsafe' });
      continue;
    }
    if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) {
      diagnostics.push({ path: relativePath, kind: classify(entry, stat), code: 'unsafe' });
    } else if (stat.isDirectory()) {
      if (!expectedDirs.has(relativePath)) {
        diagnostics.push({ path: relativePath, kind: 'directory', code: 'unexpected' });
      } else if (process.platform !== 'win32' && (Number(stat.mode) & 0o777) !== 0o755) {
        if ((Number(stat.mode) & 0o777) !== 0o777) {
          diagnostics.push({ path: relativePath, kind: 'directory', code: 'mode-mismatch', expected: 0o755, actual: Number(stat.mode) & 0o777 });
        }
      }
      collectOutput(context, path, expected, expectedDirs, seen, diagnostics);
    } else {
      const wanted = expected.get(relativePath);
      if (!wanted) {
        diagnostics.push({ path: relativePath, kind: 'file', code: 'unexpected' });
        continue;
      }
      seen.add(relativePath);
      try {
        const bytes = readOutputFile(path, stat);
        if (!bytesEqual(bytes, wanted.bytes)) {
          diagnostics.push({ path: relativePath, kind: 'file', code: 'bytes-mismatch', expected: wanted.hash, actual: contentHash(bytes) });
        } else if ((Number(stat.mode) & 0o777) !== wanted.mode) {
          if ((Number(stat.mode) & 0o777) !== 0o777) {
            diagnostics.push({ path: relativePath, kind: 'file', code: 'mode-mismatch', expected: wanted.mode, actual: Number(stat.mode) & 0o777 });
          }
        }
      } catch {
        diagnostics.push({ path: relativePath, kind: 'file', code: 'unsafe' });
      }
    }
  }
}

function validateClaude(context: ProjectionBuildContext): ProjectionValidation {
  const root = claudeRoot(context);
  try { assertStagedRoot(context.stage); }
  catch {
    return Object.freeze({
      target: 'claude' as const,
      valid: false,
      diagnostics: Object.freeze([{
        path: root,
        kind: 'directory' as const,
        code: 'unsafe' as const
      }])
    });
  }
  const diagnostics: ProjectedFileDiagnostic[] = [];
  const expected = expectedFiles(context, root);
  const expectedDirs = expectedDirectories(context, root);
  const seen = new Set<string>();
  let destination: string;
  try { destination = context.stagePath(root); }
  catch {
    diagnostics.push({ path: root, kind: 'directory', code: 'unsafe' });
    return Object.freeze({ target: 'claude' as const, valid: false, diagnostics: Object.freeze(diagnostics) });
  }
  try {
    const stat = lstatSync(destination);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      diagnostics.push({ path: root, kind: 'directory', code: 'kind-mismatch' });
    } else {
      if (process.platform !== 'win32' && (Number(stat.mode) & 0o777) !== 0o755) {
        if ((Number(stat.mode) & 0o777) !== 0o777) {
          diagnostics.push({ path: root, kind: 'directory', code: 'mode-mismatch', expected: 0o755, actual: Number(stat.mode) & 0o777 });
        }
      }
      collectOutput(context, destination, expected, expectedDirs, seen, diagnostics);
    }
  } catch {
    diagnostics.push({ path: root, kind: 'directory', code: 'missing' });
  }
  for (const [path, file] of expected) {
    if (!seen.has(path)) diagnostics.push({ path, kind: 'file', code: 'missing', expected: file.hash });
  }
  return Object.freeze({
    target: 'claude' as const,
    valid: diagnostics.length === 0,
    diagnostics: Object.freeze(diagnostics)
  });
}

function buildClaude(context: ProjectionBuildContext): void {
  assertStagedRoot(context.stage);
  const root = claudeRoot(context);
  createRoot(context, root);
  for (const file of context.resources.files) {
    writeProjectionFile(context, `${root}/${file.path}`, file.bytes, file.mode);
  }
}

export const claudeAdapter: ProjectionAdapter = Object.freeze({
  id: 'claude',
  compatibility: {
    skill: { status: 'native' },
    agent: { status: 'native' },
    workflow: { status: 'native' },
    command: { status: 'native' },
    hook: { status: 'native' }
  } as const,
  build: buildClaude,
  validate: validateClaude
});
