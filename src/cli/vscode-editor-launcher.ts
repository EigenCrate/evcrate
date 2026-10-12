import {
  accessSync,
  constants,
  existsSync,
  lstatSync,
  readFileSync,
  statSync
} from 'node:fs';
import { delimiter, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { assertNoSymlinkAncestors } from '../filesystem/paths.js';
import { VSCODE_EXTENSION_ID } from '../adapters/vscode/companion-package-contracts.js';

const MAX_DESCRIPTOR_BYTES = 1024 * 1024;
const MAX_WRAPPER_SCRIPT_BYTES = 16 * 1024;
const DP0_WRAPPER_PATTERN = /"%~dp0([^"\r\n]+\.exe)"\s+"%~dp0([^"\r\n]*resources[\\/]app[\\/]out[\\/]cli\.js)"/iu;

export type ResolvedEditorLaunchTarget =
  | {
      readonly ok: true;
      readonly executable: string;
      readonly prefixArgs: readonly string[];
      readonly envOverrides: Readonly<Record<string, string>>;
    }
  | {
      readonly ok: false;
      readonly reason: string;
    };

function isContainedRegularFile(candidatePath: string, rootDir: string, maxBytes?: number): boolean {
  try {
    const resolvedRoot = resolve(rootDir);
    const resolvedCandidate = resolve(candidatePath);
    const rel = relative(resolvedRoot, resolvedCandidate);
    if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
      return false;
    }
    if (!existsSync(resolvedCandidate)) {
      return false;
    }
    assertNoSymlinkAncestors(resolvedCandidate);
    const st = lstatSync(resolvedCandidate);
    if (!st.isFile() || st.isSymbolicLink()) {
      return false;
    }
    if (maxBytes !== undefined && st.size > maxBytes) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function resolveWindowsCmdWrapper(wrapperPath: string): ResolvedEditorLaunchTarget {
  try {
    if (!isAbsolute(wrapperPath) || !existsSync(wrapperPath)) {
      return { ok: false, reason: `Windows editor wrapper does not exist: ${wrapperPath}` };
    }
    assertNoSymlinkAncestors(wrapperPath);
    const st = lstatSync(wrapperPath);
    if (!st.isFile() || st.isSymbolicLink() || st.size > MAX_WRAPPER_SCRIPT_BYTES) {
      return { ok: false, reason: `Windows editor wrapper is not a safe regular file: ${wrapperPath}` };
    }
    const wrapperDir = dirname(wrapperPath);
    const installRoot = resolve(wrapperDir, '..');
    const content = readFileSync(wrapperPath, 'utf8');
    const match = DP0_WRAPPER_PATTERN.exec(content);

    const candidatePairs: Array<{ exe: string; cliJs: string }> = [];
    if (match) {
      candidatePairs.push({
        exe: resolve(wrapperDir, match[1]),
        cliJs: resolve(wrapperDir, match[2])
      });
    }
    const unversionedCli = resolve(installRoot, 'resources', 'app', 'out', 'cli.js');
    candidatePairs.push(
      { exe: resolve(installRoot, 'Code.exe'), cliJs: unversionedCli },
      { exe: resolve(installRoot, 'Code - Insiders.exe'), cliJs: unversionedCli }
    );

    for (const pair of candidatePairs) {
      if (isContainedRegularFile(pair.exe, installRoot) && isContainedRegularFile(pair.cliJs, installRoot)) {
        return {
          ok: true,
          executable: pair.exe,
          prefixArgs: Object.freeze([pair.cliJs]),
          envOverrides: Object.freeze({ ELECTRON_RUN_AS_NODE: '1' })
        };
      }
    }
    return {
      ok: false,
      reason: `Windows editor wrapper ${wrapperPath} could not be resolved to a verified VS Code executable and cli.js`
    };
  } catch (error) {
    return {
      ok: false,
      reason: `Failed to inspect Windows editor wrapper ${wrapperPath}: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

export function resolveVscodeEditorLaunchTarget(
  editorPath: string,
  platform: NodeJS.Platform = process.platform
): ResolvedEditorLaunchTarget {
  if (platform === 'win32') {
    if (/\.(?:cmd|bat)$/iu.test(editorPath)) {
      return resolveWindowsCmdWrapper(editorPath);
    }
    if (/\.exe$/iu.test(editorPath) && isAbsolute(editorPath) && existsSync(editorPath)) {
      const installRoot = dirname(resolve(editorPath));
      for (const cmdName of ['code.cmd', 'code-insiders.cmd']) {
        const wrapperCandidate = join(installRoot, 'bin', cmdName);
        if (existsSync(wrapperCandidate)) {
          const resolved = resolveWindowsCmdWrapper(wrapperCandidate);
          if (resolved.ok && resolved.executable.toLowerCase() === resolve(editorPath).toLowerCase()) {
            return resolved;
          }
        }
      }
      const directCliJs = join(installRoot, 'resources', 'app', 'out', 'cli.js');
      if (isContainedRegularFile(resolve(editorPath), dirname(installRoot)) && isContainedRegularFile(directCliJs, installRoot)) {
        return {
          ok: true,
          executable: resolve(editorPath),
          prefixArgs: Object.freeze([directCliJs]),
          envOverrides: Object.freeze({ ELECTRON_RUN_AS_NODE: '1' })
        };
      }
    }
  }
  return {
    ok: true,
    executable: editorPath,
    prefixArgs: Object.freeze([]),
    envOverrides: Object.freeze({})
  };
}

export function findEditorOnPath(
  env: Readonly<Record<string, string | undefined>>,
  platform: NodeJS.Platform
): string | null {
  const pathVal = env.PATH ?? process.env.PATH;
  if (!pathVal) return null;
  const dirs = pathVal.split(delimiter);
  const candidateNames = platform === 'win32'
    ? ['code.cmd', 'code.exe', 'code.bat']
    : ['code'];
  for (const dir of dirs) {
    if (!dir) continue;
    for (const name of candidateNames) {
      const candidate = join(dir, name);
      try {
        if (existsSync(candidate)) {
          const stat = statSync(candidate);
          if (stat.isFile()) {
            if (platform !== 'win32') {
              accessSync(candidate, constants.X_OK);
            }
            return candidate;
          }
        }
      } catch {
        // Ignore unreadable or non-executable files
      }
    }
  }
  return null;
}

export function verifyInstalledBuildIdentity(
  extensionsDir: string,
  version: string,
  expectedBuildIdentity: string
): boolean {
  if (!isAbsolute(extensionsDir)) return false;
  try {
    const targetDirName = `${VSCODE_EXTENSION_ID}-${version}`.toLowerCase();
    const candidatePath = join(extensionsDir, targetDirName, 'package.json');
    if (existsSync(candidatePath)) {
      assertNoSymlinkAncestors(candidatePath);
      const stats = lstatSync(candidatePath);
      if (stats.isFile() && stats.size <= MAX_DESCRIPTOR_BYTES) {
        const raw = JSON.parse(readFileSync(candidatePath, 'utf8')) as Record<string, unknown>;
        return raw.buildIdentity === expectedBuildIdentity;
      }
    }
  } catch {
    // Unverified
  }
  return false;
}
