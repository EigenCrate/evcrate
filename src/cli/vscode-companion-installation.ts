import {
  chmodSync,
  closeSync,
  constants,
  copyFileSync,
  fstatSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync
} from 'node:fs';
import { basename, isAbsolute, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import type { InvocationContext } from '../context/invocation-context.js';
import type { ResourceResult } from '../protocol/resource-control.js';
import type { CliInvocation } from './arguments.js';
import type { CliRuntime, ProcessRunner, VscodeCompanionConsole } from './types.js';
import { createDefaultVscodeCompanionConsole } from './vscode-companion-prompt.js';
import {
  findEditorOnPath,
  resolveVscodeEditorLaunchTarget,
  verifyInstalledBuildIdentity
} from './vscode-editor-launcher.js';
import { defaultProcessRunner } from './process-runner.js';
import { resolveVscodeSettingsPaths } from '../distribution/vscode-settings.js';
import { assertNoSymlinkAncestors } from '../filesystem/paths.js';
import {
  validateCompanionCliOptions,
  validateCompanionInstallNotice
} from '../adapters/vscode/companion-cli-contracts.js';
import {
  COMPANION_INSTALL_MAX_STREAM_BYTES,
  COMPANION_INSTALL_TIMEOUT_MS,
  ContractValidationError,
  VSCODE_EXTENSION_ID,
  VSCODE_PROPOSED_API_FLAG,
  validateCompanionDescriptor,
  type CompanionInstallStatus,
  type VscodeCompanionDescriptorV1,
  type VscodeCompanionInstallNoticeV1
} from '../adapters/vscode/companion-package-contracts.js';

const MAX_DESCRIPTOR_BYTES = 1024 * 1024;
const MAX_VSIX_BYTES = 64 * 1024 * 1024;
const PROBE_TIMEOUT_MS = 15_000;
const LIST_TIMEOUT_MS = 30_000;
const MAX_REASON_LENGTH = 512;

function sanitizeReason(raw: string): string {
  if (!raw) return '';
  const cleaned = raw
    .replace(/\u001b\[[0-9;]*[A-Za-z]/gu, '') // strip ANSI escapes
    .replace(/[^\x20-\x7E\t\r\n]/gu, ' ')      // strip non-printable characters
    .replace(/\s+/gu, ' ')
    .trim();
  return cleaned.length <= MAX_REASON_LENGTH ? cleaned : `${cleaned.slice(0, MAX_REASON_LENGTH - 3)}...`;
}

function emitNotice(
  consolePort: VscodeCompanionConsole,
  isMachine: boolean,
  notice: VscodeCompanionInstallNoticeV1
): void {
  const validated = validateCompanionInstallNotice(notice);
  const write = consolePort.writeStderr ? consolePort.writeStderr : (t: string) => process.stderr.write(t);
  if (isMachine) {
    write(JSON.stringify(validated) + '\n');
  } else {
    const lines = [
      `[vscode-companion] Status: ${validated.status}`,
      `[vscode-companion] Extension: ${validated.extensionId}@${validated.version}`,
      ...(validated.editor ? [`[vscode-companion] Editor: ${validated.editor}`] : []),
      ...(validated.profile ? [`[vscode-companion] Profile: ${validated.profile}`] : []),
      `[vscode-companion] Reason: ${validated.reason}`,
      `[vscode-companion] Launch flag: ${validated.proposedApiFlag}\n`
    ];
    write(lines.join('\n'));
  }
}


export async function coordinateVscodeCompanionInstallation(
  invocation: CliInvocation,
  context: InvocationContext,
  result: ResourceResult,
  runtime: CliRuntime,
  _requestId: string
): Promise<number | undefined> {
  const hasVscode = context.selectedTargetIds.includes('vscode');
  if (!hasVscode) return undefined;

  const isPublishApply = (
    result.operation === 'publish.apply'
    || result.operation === 'distribute.publish'
    || result.operation === 'distribute.all'
  );
  const isCommitted = result.status === 'published' || result.status === 'activated';
  if (!isPublishApply || !isCommitted) return undefined;

  const rawEnv = runtime.env ?? process.env;
  let isRequested = false;
  const consolePort = runtime.vscodeCompanionConsole ?? createDefaultVscodeCompanionConsole();
  const isOutputTTY = runtime.output?.isTTY !== false && (consolePort.isOutputTTY ?? Boolean(process.stdout.isTTY));
  const isMachine = invocation.options.json || !isOutputTTY;

  // Top-level error boundary to protect committed publication on stdout
  try {
    let validatedOptions;
    try {
      validatedOptions = validateCompanionCliOptions({
        commandKind: invocation.command.kind,
        commandAction: 'action' in invocation.command ? invocation.command.action : undefined,
        targets: context.selectedTargetIds,
        installVscodeCompanion: invocation.options.installVscodeCompanion === true ? true : undefined,
        noInstallVscodeCompanion: invocation.options.installVscodeCompanion === false ? true : undefined,
        vscodeEditor: invocation.options.vscodeEditor,
        vscodeProfile: invocation.options.vscodeProfile,
        env: rawEnv
      });
    } catch (error) {
      if (error instanceof ContractValidationError) {
        return 5;
      }
      throw error;
    }

    isRequested = validatedOptions.companionInstallPolicy === 'explicit-install';
    const isInputTTY = consolePort.isInputTTY ?? Boolean(process.stdin.isTTY);
    const isErrorTTY = consolePort.isErrorTTY ?? Boolean(process.stderr.isTTY);

    const platform = runtime.platform ?? process.platform;
    const paths = resolveVscodeSettingsPaths({
      scope: invocation.options.scope,
      projectRoot: context.projectRoot,
      homeRoot: context.homeRoot,
      nativeUserHome: runtime.platformHome,
      env: rawEnv,
      platform
    });

    const descriptorPath = join(paths.pluginPath, 'evcrate', 'companion', 'package.json');
    let descriptor: VscodeCompanionDescriptorV1 | null = null;
    try {
      assertNoSymlinkAncestors(descriptorPath);
      const descStats = lstatSync(descriptorPath);
      if (!descStats.isFile() || descStats.size > MAX_DESCRIPTOR_BYTES) {
        throw new Error('Companion descriptor is not a safe regular file');
      }
      const rawJson = JSON.parse(readFileSync(descriptorPath, 'utf8'));
      descriptor = validateCompanionDescriptor(rawJson);
    } catch (error) {
      const reason = sanitizeReason(
        `Committed companion descriptor is unreadable or invalid: ${error instanceof Error ? error.message : String(error)}`
      );
      if (isRequested) {
        emitNotice(consolePort, isMachine, {
          schema: 'evcrate-vscode-companion-install-v1',
          publication: 'committed',
          status: 'failed',
          requested: true,
          exitCode: 5,
          extensionId: VSCODE_EXTENSION_ID,
          version: '0.0.0',
          buildIdentity: null,
          editor: validatedOptions.vscodeEditor,
          profile: validatedOptions.vscodeProfile,
          reason,
          proposedApiFlag: VSCODE_PROPOSED_API_FLAG
        });
        return 5;
      }
      return undefined;
    }

    const finish = (
      status: CompanionInstallStatus,
      rawReason: string,
      extra: { editor?: string | null; profile?: string | null } = {}
    ): number | undefined => {
      const reason = sanitizeReason(rawReason);
      const expectedExitCode = isRequested && (status === 'failed' || status === 'manual-setup-required') ? 5 : 0;
      emitNotice(consolePort, isMachine, {
        schema: 'evcrate-vscode-companion-install-v1',
        publication: 'committed',
        status,
        requested: isRequested,
        exitCode: expectedExitCode,
        extensionId: VSCODE_EXTENSION_ID,
        version: descriptor.version,
        buildIdentity: descriptor.buildIdentity,
        editor: extra.editor !== undefined ? extra.editor : validatedOptions.vscodeEditor,
        profile: extra.profile !== undefined ? extra.profile : validatedOptions.vscodeProfile,
        reason,
        proposedApiFlag: VSCODE_PROPOSED_API_FLAG
      });
      return expectedExitCode === 5 ? 5 : undefined;
    };

    // Explicit skip flag
    if (validatedOptions.companionInstallPolicy === 'explicit-skip') {
      return finish('skipped', 'Companion installation skipped via --no-install-vscode-companion');
    }

    // Remote context check
    if (validatedOptions.remoteContextUnsupported) {
      if (isRequested) {
        return finish(
          'manual-setup-required',
          'Unsupported remote context (SSH/dev-container/WSL) detected; local companion installation refused; manual setup required'
        );
      }
      return finish('skipped', 'Unsupported remote context (SSH/dev-container/WSL); companion installation skipped');
    }

    // Non-interactive or CI without explicit flag
    if (validatedOptions.companionInstallPolicy === 'default-prompt') {
      const ciRaw = (rawEnv.CI ?? '').trim().toLowerCase();
      const isCI = Boolean(ciRaw) && ciRaw !== '0' && ciRaw !== 'false';
      if (!isOutputTTY || !isInputTTY || !isErrorTTY || invocation.options.json || isCI) {
        return finish(
          'skipped',
          'Non-interactive or CI environment without explicit --install-vscode-companion flag; installation skipped'
        );
      }
    }

    // Committed VSIX validation using safe file descriptor
    const committedVsixPath = join(paths.pluginPath, descriptor.vsixRelativePath);
    try {
      assertNoSymlinkAncestors(committedVsixPath);
      const fd = openSync(committedVsixPath, constants.O_RDONLY);
      try {
        const vsixStats = fstatSync(fd);
        if (!vsixStats.isFile() || vsixStats.size > MAX_VSIX_BYTES) {
          throw new Error('Committed companion VSIX is not a safe regular file');
        }
      } finally {
        closeSync(fd);
      }
    } catch (error) {
      return finish(
        'failed',
        `Committed companion VSIX is unreadable or missing: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Stage VSIX into private instance-owned directory
    let stageDir: string;
    try {
      stageDir = mkdtempSync(join(tmpdir(), 'evcrate-companion-stage-'));
      chmodSync(stageDir, 0o700);
    } catch (error) {
      return finish(
        'failed',
        `Failed to create private staging directory: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    try {
      const stagedVsixPath = join(stageDir, basename(descriptor.vsixRelativePath));
      copyFileSync(committedVsixPath, stagedVsixPath);

      // Verify staged copy hash
      const stagedBytes = readFileSync(stagedVsixPath);
      const stagedHash = createHash('sha256').update(stagedBytes).digest('hex');
      if (stagedHash !== descriptor.vsixSha256) {
        return finish(
          'failed',
          `Staged companion VSIX hash mismatch with committed descriptor (expected ${descriptor.vsixSha256}, got ${stagedHash})`
        );
      }

      // Resolve editor executable
      let editorPath = validatedOptions.vscodeEditor;
      if (!editorPath) {
        editorPath = runtime.vscodeEditorExecutable ?? findEditorOnPath(rawEnv, platform);
      }
      if (!editorPath) {
        return finish(
          'manual-setup-required',
          'VS Code executable not found; install manually or specify --vscode-editor',
          { editor: null }
        );
      }
      const launchTarget = resolveVscodeEditorLaunchTarget(editorPath, platform);
      if (!launchTarget.ok) {
        return finish('failed', launchTarget.reason, { editor: editorPath });
      }

      const runner: ProcessRunner = runtime.processRunner ?? defaultProcessRunner;
      const hasEnvOverrides = Object.keys(launchTarget.envOverrides).length > 0;
      const baseRunOpts = {
        executable: launchTarget.executable,
        ...(hasEnvOverrides ? { env: { ...rawEnv, ...launchTarget.envOverrides }, allowElectronRunAsNode: true } : {}),
        maxStdoutBytes: COMPANION_INSTALL_MAX_STREAM_BYTES,
        maxStderrBytes: COMPANION_INSTALL_MAX_STREAM_BYTES,
        signal: runtime.abortSignal
      };

      // Probe editor capability
      const probeResult = await runner.run({
        ...baseRunOpts,
        args: [...launchTarget.prefixArgs, '--version'],
        timeoutMs: PROBE_TIMEOUT_MS
      });
      if (probeResult.termination !== 'completed' || probeResult.exitCode !== 0) {
        return finish(
          'failed',
          `Failed to execute editor --version using ${editorPath}: ${probeResult.stderr.trim() || probeResult.termination}`,
          { editor: editorPath }
        );
      }

      const profile = validatedOptions.vscodeProfile ?? null;
      const isolationArgs = [
        ...(runtime.userDataDirectory && isAbsolute(runtime.userDataDirectory)
          ? ['--user-data-dir', runtime.userDataDirectory]
          : []),
        ...(runtime.userDataDirectory && runtime.extensionsDirectory && isAbsolute(runtime.extensionsDirectory)
          ? ['--extensions-dir', runtime.extensionsDirectory]
          : [])
      ];

      // Check existing installation & build identity
      const listArgs = [
        ...isolationArgs,
        ...(profile ? ['--profile', profile] : []),
        '--list-extensions',
        '--show-versions'
      ];
      const listResult = await runner.run({
        ...baseRunOpts,
        args: [...launchTarget.prefixArgs, ...listArgs],
        timeoutMs: LIST_TIMEOUT_MS
      });
      if (listResult.termination !== 'completed' || listResult.exitCode !== 0) {
        return finish(
          'failed',
          `Failed to list extensions from editor: ${listResult.stderr.trim() || listResult.termination}`,
          { editor: editorPath, profile }
        );
      }

      const lines = listResult.stdout.split(/\r?\n/u);
      const extPrefix = `${VSCODE_EXTENSION_ID.toLowerCase()}@`;
      const matchedLine = lines.find((l) => l.trim().toLowerCase().startsWith(extPrefix));
      if (matchedLine) {
        const installedVersion = matchedLine.trim().slice(extPrefix.length);
        if (installedVersion === descriptor.version) {
          let extensionsDir = runtime.extensionsDirectory ?? null;
          if (!extensionsDir) {
            const userHome = runtime.platformHome ?? process.env.HOME ?? process.env.USERPROFILE;
            if (userHome && isAbsolute(userHome)) {
              extensionsDir = join(userHome, '.vscode', 'extensions');
            }
          }
          const isVerified = extensionsDir ? verifyInstalledBuildIdentity(extensionsDir, descriptor.version, descriptor.buildIdentity) : false;
          if (isVerified) {
            return finish(
              'already-installed',
              `Companion extension is already installed with matching version ${descriptor.version} and verified build identity`,
              { editor: editorPath, profile }
            );
          }
          // Same version but unverified build identity -> manual-setup-required
          return finish(
            'manual-setup-required',
            `Companion extension already installed with version ${descriptor.version} but installed build identity cannot be verified; manual setup required`,
            { editor: editorPath, profile }
          );
        }
      }

      // Interactive prompt if policy is default-prompt
      if (validatedOptions.companionInstallPolicy === 'default-prompt') {
        const question = [
          `\n[vscode] Companion Extension: ${VSCODE_EXTENSION_ID}`,
          `[vscode] Version: ${descriptor.version}`,
          `[vscode] Build Identity: ${descriptor.buildIdentity}`,
          `[vscode] VSIX SHA-256: ${descriptor.vsixSha256}`,
          `[vscode] Staged VSIX: ${stagedVsixPath}`,
          `[vscode] Editor: ${editorPath}`,
          `[vscode] Profile: ${profile ?? 'default'}`,
          `[vscode] Launch requirement: ${VSCODE_PROPOSED_API_FLAG}`,
          'Install companion extension now? [y/N] '
        ].join('\n');

        const confirmed = await consolePort.confirm(question, runtime.abortSignal);
        if (!confirmed) {
          return finish('declined', 'Companion installation declined by user', { editor: editorPath, profile });
        }
      }

      // Run installation via processRunner
      const installArgs = [
        ...isolationArgs,
        ...(profile ? ['--profile', profile] : []),
        '--install-extension',
        stagedVsixPath
      ];
      const installResult = await runner.run({
        ...baseRunOpts,
        args: [...launchTarget.prefixArgs, ...installArgs],
        timeoutMs: COMPANION_INSTALL_TIMEOUT_MS
      });

      if (installResult.termination !== 'completed' || installResult.exitCode !== 0) {
        const detail = installResult.stderr.trim() || installResult.stdout.trim() || installResult.termination;
        return finish(
          'failed',
          `Failed to install companion extension: ${detail}`,
          { editor: editorPath, profile }
        );
      }

      // Post-install verification: re-probe extensions list to confirm extension presence
      const postListResult = await runner.run({
        ...baseRunOpts,
        args: [...launchTarget.prefixArgs, ...listArgs],
        timeoutMs: LIST_TIMEOUT_MS
      });
      if (postListResult.termination !== 'completed' || postListResult.exitCode !== 0) {
        return finish(
          'failed',
          `Post-install verification re-probe failed: ${postListResult.stderr.trim() || postListResult.termination}`,
          { editor: editorPath, profile }
        );
      }
      const postLines = postListResult.stdout.split(/\r?\n/u);
      const exactExtLine = `${extPrefix}${descriptor.version}`;
      const postMatched = postLines.some((l) => l.trim().toLowerCase() === exactExtLine);
      if (!postMatched) {
        return finish(
          'failed',
          `Extension installation completed but ${exactExtLine} was not detected in target extensions list`,
          { editor: editorPath, profile }
        );
      }

      return finish(
        'installed',
        'Companion extension installed successfully',
        { editor: editorPath, profile }
      );
    } finally {
      try {
        rmSync(stageDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup error
      }
    }
  } catch (unexpectedError) {
    // Uncaught exception guard: never allow unexpected post-commit errors to escape
    const reason = sanitizeReason(
      `Unexpected error during companion installation: ${unexpectedError instanceof Error ? unexpectedError.message : String(unexpectedError)}`
    );
    try {
      emitNotice(consolePort, isMachine, {
        schema: 'evcrate-vscode-companion-install-v1',
        publication: 'committed',
        status: 'failed',
        requested: isRequested,
        exitCode: isRequested ? 5 : 0,
        extensionId: VSCODE_EXTENSION_ID,
        version: '0.0.0',
        buildIdentity: null,
        editor: null,
        profile: null,
        reason,
        proposedApiFlag: VSCODE_PROPOSED_API_FLAG
      });
    } catch {
      // Ignore notice emission error on unexpected failure
    }
    return isRequested ? 5 : undefined;
  }
}
