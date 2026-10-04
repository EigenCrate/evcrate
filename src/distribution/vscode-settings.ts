import { chmodSync, existsSync, lstatSync, openSync, closeSync, readFileSync, type Stats } from 'node:fs';
import { dirname, isAbsolute, join, normalize, parse } from 'node:path';
import * as pathPosix from 'node:path/posix';
import * as pathWin32 from 'node:path/win32';
import * as os from 'node:os';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { decodeJsonc, jsoncNewline, scanJsonObject, type JsoncMemberSpan, type JsoncObjectScan } from './jsonc.js';
import type { PublicationScope } from '../protocol/publication-payloads.js';
import { writeAtomicFile } from '../filesystem/atomic.js';
import { withLock } from '../filesystem/locking.js';
import { assertNoSymlinkAncestors, assertRealDirectory } from '../filesystem/paths.js';

export type RegistrationState = 'absent' | 'enabled' | 'disabled';

export interface VscodeSettingsPaths {
  readonly settingsPath: string;
  readonly pluginPath: string;
  readonly scope: PublicationScope;
}

export interface VscodeSettingsPlan {
  readonly action: 'create' | 'update' | 'noop';
  readonly registration: RegistrationState;
  readonly originalKey: string | null;
  readonly original: Uint8Array | null;
  readonly result: Uint8Array;
}

export interface ResolveSettingsPathsInput {
  readonly scope: PublicationScope;
  readonly projectRoot?: string;
  readonly homeRoot?: string;
  readonly nativeUserHome?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly platform?: NodeJS.Platform;
}

export interface RegistrationOutcome {
  readonly action: 'created' | 'updated' | 'already-enabled' | 'preserved-disabled';
  readonly settingsPath: string;
  readonly pluginPath: string;
}

const SETTINGS_LOCK_NAME = '.evcrate-vscode-settings.lock';
const DOTTED_SETTING_KEY = 'chat.pluginLocations';
const MAX_SETTINGS_FILE_BYTES = 16 * 1024 * 1024;

export function normalizePluginPathKey(key: string, platform: NodeJS.Platform = process.platform): string {
  if (platform === 'win32') {
    let normalized = pathWin32.normalize(key.replace(/\//gu, '\\'));
    if (normalized.length > 3 && (normalized.endsWith('\\') || normalized.endsWith('/'))) {
      normalized = normalized.slice(0, -1);
    }
    return normalized.toLowerCase();
  }
  let normalized = pathPosix.normalize(key);
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

export function resolveVscodeSettingsPaths(input: ResolveSettingsPathsInput): VscodeSettingsPaths {
  const platform = input.platform ?? process.platform;
  const pathMod = platform === 'win32' ? pathWin32 : pathPosix;

  if (input.scope === 'project') {
    const projectRoot = input.projectRoot;
    if (!projectRoot || typeof projectRoot !== 'string' || !pathMod.isAbsolute(projectRoot)) {
      throw new ControlPlaneError('PATH_UNSAFE', 'Absolute project root is required for project scope');
    }
    const pluginPath = pathMod.join(projectRoot, '.evcrate-vscode');
    const settingsPath = pathMod.join(projectRoot, '.vscode', 'settings.json');
    return Object.freeze({ settingsPath, pluginPath, scope: 'project' });
  }

  if (input.scope === 'home') {
    const homeRoot = input.homeRoot ?? input.nativeUserHome ?? (platform === 'win32' ? (input.env?.USERPROFILE ?? os.homedir()) : os.homedir());
    if (!homeRoot || typeof homeRoot !== 'string' || !pathMod.isAbsolute(homeRoot)) {
      throw new ControlPlaneError('PATH_UNSAFE', 'Absolute home root is required for home scope');
    }
    const pluginPath = pathMod.join(homeRoot, '.evcrate-vscode');

    let settingsPath: string;
    if (platform === 'win32') {
      const appData = input.env?.APPDATA ?? process.env.APPDATA;
      if (!appData || typeof appData !== 'string' || !pathWin32.isAbsolute(appData)) {
        throw new ControlPlaneError('CAPABILITY_UNSUPPORTED', 'APPDATA environment variable is unavailable on Windows');
      }
      settingsPath = pathWin32.join(appData, 'Code', 'User', 'settings.json');
    } else if (platform === 'darwin') {
      const userHome = input.nativeUserHome ?? os.homedir();
      if (!userHome || typeof userHome !== 'string' || !pathPosix.isAbsolute(userHome)) {
        throw new ControlPlaneError('PATH_UNSAFE', 'Absolute user home is required on macOS');
      }
      settingsPath = pathPosix.join(userHome, 'Library', 'Application Support', 'Code', 'User', 'settings.json');
    } else {
      const userHome = input.nativeUserHome ?? os.homedir();
      if (!userHome || typeof userHome !== 'string' || !pathPosix.isAbsolute(userHome)) {
        throw new ControlPlaneError('PATH_UNSAFE', 'Absolute user home is required on Linux');
      }
      settingsPath = pathPosix.join(userHome, '.config', 'Code', 'User', 'settings.json');
    }
    return Object.freeze({ settingsPath, pluginPath, scope: 'home' });
  }

  throw new ControlPlaneError('VALIDATION_INVALID', `Unsupported publication scope: ${String(input.scope)}`);
}

function getObjectIndent(text: string, objectScan: JsoncObjectScan, defaultIndent = '  '): { memberIndent: string; closingIndent: string } {
  const lines = text.slice(0, objectScan.end).split(/\r?\n/u);
  const closingLine = lines[lines.length - 1] ?? '';
  const closingIndentMatch = closingLine.match(/^\s*/u);
  const closingIndent = closingIndentMatch ? closingIndentMatch[0] : '';

  if (objectScan.members.size > 0) {
    const firstMember = objectScan.members.values().next().value;
    if (firstMember) {
      const textUpToKey = text.slice(0, firstMember.keySpan[0]);
      const lastNewlineIndex = Math.max(textUpToKey.lastIndexOf('\n'), textUpToKey.lastIndexOf('\r'));
      const lineBeforeKey = lastNewlineIndex >= 0 ? textUpToKey.slice(lastNewlineIndex + 1) : textUpToKey;
      const match = lineBeforeKey.match(/^\s*/u);
      if (match && match[0].length > 0) {
        return { memberIndent: match[0], closingIndent };
      }
    }
  }

  return { memberIndent: closingIndent + defaultIndent, closingIndent };
}

function insertMemberIntoObject(
  text: string,
  objectScan: JsoncObjectScan,
  key: string,
  valueText: string,
  newline: string
): string {
  const { memberIndent, closingIndent } = getObjectIndent(text, objectScan);
  const escapedKey = JSON.stringify(key);

  if (objectScan.members.size === 0) {
    const isMultiLine = text.slice(objectScan.start, objectScan.end).includes('\n') || text.slice(objectScan.start, objectScan.end).includes('\r');
    if (!isMultiLine) {
      return (
        text.slice(0, objectScan.start + 1)
        + newline
        + memberIndent
        + `${escapedKey}: ${valueText}`
        + newline
        + closingIndent
        + text.slice(objectScan.end - 1)
      );
    }
    const closeIndex = objectScan.end - 1;
    return (
      text.slice(0, closeIndex)
      + memberIndent
      + `${escapedKey}: ${valueText}`
      + newline
      + text.slice(closeIndex)
    );
  }

  let lastMember: JsoncMemberSpan | undefined;
  for (const member of objectScan.members.values()) {
    if (!lastMember || member.valueSpan[1] > lastMember.valueSpan[1]) {
      lastMember = member;
    }
  }

  if (!lastMember) {
    throw new ControlPlaneError('VALIDATION_INVALID', 'Failed to locate last object member');
  }

  const afterLastValue = text.slice(lastMember.valueSpan[1], objectScan.end - 1);
  const hasComma = afterLastValue.split('//')[0]?.includes(',') ?? false;

  let commaInsertion = '';
  let modifiedText = text;

  if (!hasComma) {
    const commaIndex = lastMember.valueSpan[1];
    modifiedText = text.slice(0, commaIndex) + ',' + text.slice(commaIndex);
  }

  const closeIndex = modifiedText.lastIndexOf('}', objectScan.end + (hasComma ? 0 : 1));
  if (closeIndex < 0) {
    throw new ControlPlaneError('VALIDATION_INVALID', 'Malformed object closing brace');
  }

  const insertion = `${memberIndent}${escapedKey}: ${valueText}${newline}`;
  return modifiedText.slice(0, closeIndex) + insertion + closingIndent + modifiedText.slice(closeIndex);
}

export function detectVscodeRegistration(
  existingBytes: Uint8Array | null,
  pluginPath: string,
  options: { platform?: NodeJS.Platform } = {}
): { state: RegistrationState; originalKey: string | null } {
  if (existingBytes === null || existingBytes.byteLength === 0) {
    return { state: 'absent', originalKey: null };
  }

  if (existingBytes.byteLength > MAX_SETTINGS_FILE_BYTES) {
    throw new ControlPlaneError('VALIDATION_INVALID', 'VS Code settings file exceeds maximum byte size');
  }
  let decoded: { value: unknown; text: string };
  let rootScan: JsoncObjectScan;
  try {
    decoded = decodeJsonc(existingBytes, 'VS Code settings');
    if (decoded.value === null || typeof decoded.value !== 'object' || Array.isArray(decoded.value)) {
      throw new ControlPlaneError('VALIDATION_INVALID', 'VS Code settings root must be a JSON object');
    }
    rootScan = scanJsonObject(decoded.text, 0, { requireEndOfDocument: true });
  } catch (error) {
    if (error instanceof ControlPlaneError) throw error;
    throw new ControlPlaneError('VALIDATION_INVALID', error instanceof Error ? error.message : String(error));
  }
  const { text } = decoded;
  const pluginLocationsMember = rootScan.members.get(DOTTED_SETTING_KEY);
  if (!pluginLocationsMember) {
    return { state: 'absent', originalKey: null };
  }

  const locationsScan = scanJsonObject(text, pluginLocationsMember.valueSpan[0]);
  const platform = options.platform ?? process.platform;
  const targetNormalized = normalizePluginPathKey(pluginPath, platform);

  let matchedState: RegistrationState = 'absent';
  let matchedKey: string | null = null;
  const seenMatches: string[] = [];

  for (const [key, span] of locationsScan.members) {
    const keyNormalized = normalizePluginPathKey(key, platform);
    if (keyNormalized === targetNormalized) {
      seenMatches.push(key);
      const rawValue = text.slice(span.valueSpan[0], span.valueSpan[1]).trim();
      if (rawValue === 'true') {
        matchedState = 'enabled';
        matchedKey = key;
      } else if (rawValue === 'false') {
        matchedState = 'disabled';
        matchedKey = key;
      } else {
        throw new ControlPlaneError('VALIDATION_INVALID', `Entry for "${key}" in chat.pluginLocations must be a boolean`);
      }
    }
  }

  if (seenMatches.length > 1) {
    throw new ControlPlaneError('VALIDATION_INVALID', `Multiple equivalent entries for plugin path found in chat.pluginLocations: ${seenMatches.join(', ')}`);
  }

  return { state: matchedState, originalKey: matchedKey };
}

export function planVscodeSettingsRegistration(
  existingBytes: Uint8Array | null,
  pluginPath: string,
  options: { platform?: NodeJS.Platform; enableDisabled?: boolean } = {}
): VscodeSettingsPlan {
  const platform = options.platform ?? process.platform;

  if (existingBytes === null) {
    const newline = '\n';
    const escapedPath = JSON.stringify(pluginPath);
    const text = `{\n  "${DOTTED_SETTING_KEY}": {\n    ${escapedPath}: true\n  }\n}\n`;
    const result = new TextEncoder().encode(text);
    return Object.freeze({
      action: 'create',
      registration: 'absent',
      originalKey: null,
      original: null,
      result
    });
  }

  if (existingBytes.byteLength === 0) {
    throw new ControlPlaneError('VALIDATION_INVALID', 'Empty VS Code settings file is invalid JSONC');
  }

  const detection = detectVscodeRegistration(existingBytes, pluginPath, { platform });
  if (detection.state === 'enabled') {
    return Object.freeze({
      action: 'noop',
      registration: 'enabled',
      originalKey: detection.originalKey,
      original: existingBytes,
      result: existingBytes
    });
  }

  if (detection.state === 'disabled' && !options.enableDisabled) {
    return Object.freeze({
      action: 'noop',
      registration: 'disabled',
      originalKey: detection.originalKey,
      original: existingBytes,
      result: existingBytes
    });
  }

  let text: string;
  let newline: string;
  let rootScan: JsoncObjectScan;
  try {
    const decoded = decodeJsonc(existingBytes, 'VS Code settings');
    text = decoded.text;
    newline = jsoncNewline(text);
    rootScan = scanJsonObject(text, 0, { requireEndOfDocument: true });
  } catch (error) {
    if (error instanceof ControlPlaneError) throw error;
    throw new ControlPlaneError('VALIDATION_INVALID', error instanceof Error ? error.message : String(error));
  }
  if (detection.state === 'disabled' && options.enableDisabled) {
    const pluginLocationsMember = rootScan.members.get(DOTTED_SETTING_KEY);
    if (!pluginLocationsMember) {
      throw new ControlPlaneError('VALIDATION_INVALID', 'chat.pluginLocations member missing during update');
    }
    const locationsScan = scanJsonObject(text, pluginLocationsMember.valueSpan[0]);
    const targetNormalized = normalizePluginPathKey(pluginPath, platform);
    let targetSpan: JsoncMemberSpan | undefined;
    for (const [key, span] of locationsScan.members) {
      if (normalizePluginPathKey(key, platform) === targetNormalized) {
        targetSpan = span;
        break;
      }
    }
    if (!targetSpan) {
      throw new ControlPlaneError('VALIDATION_INVALID', 'Target member span missing during update');
    }
    const updatedText = text.slice(0, targetSpan.valueSpan[0]) + 'true' + text.slice(targetSpan.valueSpan[1]);
    decodeJsonc(new TextEncoder().encode(updatedText), 'Updated VS Code settings');
    return Object.freeze({
      action: 'update',
      registration: 'disabled',
      originalKey: detection.originalKey,
      original: existingBytes,
      result: new TextEncoder().encode(updatedText)
    });
  }

  // detection.state === 'absent'
  const pluginLocationsMember = rootScan.members.get(DOTTED_SETTING_KEY);
  let updatedText: string;

  if (pluginLocationsMember) {
    const locationsScan = scanJsonObject(text, pluginLocationsMember.valueSpan[0]);
    updatedText = insertMemberIntoObject(text, locationsScan, pluginPath, 'true', newline);
  } else {
    const nestedNewline = newline;
    const escapedPath = JSON.stringify(pluginPath);
    const valueText = `{\n  ${escapedPath}: true\n}`;
    updatedText = insertMemberIntoObject(text, rootScan, DOTTED_SETTING_KEY, valueText, newline);
  }

  decodeJsonc(new TextEncoder().encode(updatedText), 'Updated VS Code settings');

  return Object.freeze({
    action: 'update',
    registration: 'absent',
    originalKey: null,
    original: existingBytes,
    result: new TextEncoder().encode(updatedText)
  });
}

export async function registerVscodeSettings(
  paths: VscodeSettingsPaths,
  options: {
    platform?: NodeJS.Platform;
    enableDisabled?: boolean;
    abortSignal?: AbortSignal;
  } = {}
): Promise<RegistrationOutcome> {
  if (options.abortSignal?.aborted) {
    throw new ControlPlaneError('INTERNAL_ERROR', 'Operation aborted before settings registration');
  }

  const platform = options.platform ?? process.platform;
  const settingsDir = dirname(paths.settingsPath);
  assertNoSymlinkAncestors(settingsDir);

  return withLock(settingsDir, SETTINGS_LOCK_NAME, () => {
    if (options.abortSignal?.aborted) {
      throw new ControlPlaneError('INTERNAL_ERROR', 'Operation aborted during lock acquisition');
    }

    let existingBytes: Uint8Array | null = null;
    let existingStats: Stats | null = null;

    if (existsSync(paths.settingsPath)) {
      assertNoSymlinkAncestors(paths.settingsPath);
      existingStats = lstatSync(paths.settingsPath);
      if (existingStats.isSymbolicLink() || !existingStats.isFile()) {
        throw new ControlPlaneError('PATH_UNSAFE', 'VS Code settings path is not a regular file');
      }
      existingBytes = readFileSync(paths.settingsPath);
    }

    const plan = planVscodeSettingsRegistration(existingBytes, paths.pluginPath, {
      platform,
      enableDisabled: options.enableDisabled
    });

    if (plan.action === 'noop') {
      return {
        action: plan.registration === 'enabled' ? 'already-enabled' : 'preserved-disabled',
        settingsPath: paths.settingsPath,
        pluginPath: paths.pluginPath
      };
    }

    if (options.abortSignal?.aborted) {
      throw new ControlPlaneError('INTERNAL_ERROR', 'Operation aborted before settings write');
    }

    writeAtomicFile(paths.settingsPath, plan.result);

    if (platform !== 'win32') {
      try {
        if (existingStats) {
          chmodSync(paths.settingsPath, existingStats.mode & 0o777);
        } else {
          chmodSync(paths.settingsPath, 0o600);
        }
      } catch {
        // Non-fatal if chmod fails
      }
    }

    return {
      action: plan.action === 'create' ? 'created' : 'updated',
      settingsPath: paths.settingsPath,
      pluginPath: paths.pluginPath
    };
  });
}
