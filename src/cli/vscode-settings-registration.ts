import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { ControlPlaneError, exitCodeForError } from '../errors/control-plane-error.js';
import type { InvocationContext } from '../context/invocation-context.js';
import type { ResourceResult } from '../protocol/resource-control.js';
import type { CliInvocation } from './arguments.js';
import type { CliRuntime } from './types.js';
import { createDefaultVscodeSettingsConsole } from './vscode-settings-prompt.js';
import {
  detectVscodeRegistration,
  registerVscodeSettings,
  resolveVscodeSettingsPaths
} from '../distribution/vscode-settings.js';
import { assertNoSymlinkAncestors } from '../filesystem/paths.js';

export async function coordinateVscodeSettingsRegistration(
  invocation: CliInvocation,
  context: InvocationContext,
  result: ResourceResult,
  runtime: CliRuntime,
  requestId: string
): Promise<number | undefined> {
  const hasVscode = context.selectedTargetIds.includes('vscode');
  if (!hasVscode) {
    if (invocation.options.registerVscodeSettings !== undefined) {
      throw new ControlPlaneError('USAGE_INVALID', '--register-vscode-settings requires vscode among selected targets');
    }
    return undefined;
  }

  const isPublishApply = (
    result.operation === 'publish.apply'
    || result.operation === 'distribute.publish'
    || result.operation === 'distribute.all'
  );
  const isCommitted = result.status === 'published' || result.status === 'activated';
  if (!isPublishApply || !isCommitted) {
    return undefined;
  }

  if (invocation.options.registerVscodeSettings === false) {
    return undefined;
  }

  const isExplicit = invocation.options.registerVscodeSettings === true;
  const consolePort = runtime.vscodeSettingsConsole ?? createDefaultVscodeSettingsConsole();

  if (!isExplicit) {
    const isOutputTTY = runtime.output?.isTTY !== false && (consolePort.isOutputTTY ?? Boolean(process.stdout.isTTY));
    const isInputTTY = consolePort.isInputTTY ?? Boolean(process.stdin.isTTY);
    const isErrorTTY = consolePort.isErrorTTY ?? Boolean(process.stderr.isTTY);
    if (!isOutputTTY || !isInputTTY || !isErrorTTY || invocation.options.json) {
      return undefined;
    }
    const ciRaw = (runtime.env !== undefined ? (runtime.env.CI ?? '') : (process.env.CI ?? '')).trim().toLowerCase();
    const isCI = Boolean(ciRaw) && ciRaw !== '0' && ciRaw !== 'false';
    if (isCI) {
      return undefined;
    }
  }

  const platform = runtime.platform ?? process.platform;
  const scope = invocation.options.scope;
  const paths = resolveVscodeSettingsPaths({
    scope,
    projectRoot: context.projectRoot,
    homeRoot: context.homeRoot,
    nativeUserHome: runtime.platformHome,
    env: runtime.env,
    platform
  });

  let existingBytes: Uint8Array | null = null;
  if (existsSync(paths.settingsPath)) {
    try {
      assertNoSymlinkAncestors(paths.settingsPath);
      const stats = lstatSync(paths.settingsPath);
      if (stats.isSymbolicLink() || !stats.isFile() || stats.size > 16 * 1024 * 1024) {
        throw new ControlPlaneError('PATH_UNSAFE', 'VS Code settings path is not a safe regular file');
      }
      existingBytes = readFileSync(paths.settingsPath);
    } catch (error) {
      if (isExplicit) {
        process.stderr.write(`[vscode] Error: Failed to read VS Code settings at ${paths.settingsPath}\n`);
        return exitCodeForError(error);
      }
      process.stderr.write(`[vscode] Warning: Could not read VS Code settings at ${paths.settingsPath}\n`);
      return undefined;
    }
  }

  const detection = detectVscodeRegistration(existingBytes, paths.pluginPath, { platform });
  if (detection.state === 'enabled') {
    return undefined;
  }
  if (detection.state === 'disabled' && !isExplicit) {
    return undefined;
  }

  if (detection.state === 'absent' && !isExplicit) {
    const question = `\n[vscode] Plugin path "${paths.pluginPath}" is not registered in VS Code settings (${paths.settingsPath}).\nRegister this plugin in chat.pluginLocations? [y/N] `;
    const confirmed = await consolePort.confirm(question, runtime.abortSignal);
    if (!confirmed) {
      return undefined;
    }
  }

  try {
    const outcome = await registerVscodeSettings(paths, {
      platform,
      enableDisabled: isExplicit,
      abortSignal: runtime.abortSignal
    });
    if (outcome.action === 'created' || outcome.action === 'updated') {
      const notice = `[vscode] Registered "${paths.pluginPath}" in ${paths.settingsPath}\n`;
      if (consolePort.writeNotice) {
        consolePort.writeNotice(notice);
      } else {
        process.stderr.write(notice);
      }
    }
    return undefined;
  } catch (error) {
    if (isExplicit) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`[vscode] Error: Failed to register VS Code settings: ${message}\n`);
      return exitCodeForError(error);
    }
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[vscode] Warning: Failed to register VS Code settings: ${message}\n`);
    return undefined;
  }
}
