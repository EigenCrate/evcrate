import { existsSync, lstatSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  CompanionContractError,
  resolveInstallationRoot,
  validateLocalRootUri,
  type CandidateInstallationRoot,
  type InstallationSelectionInput,
  type ValidatedLocalRootUri
} from './runtime-contracts.js';

const FS_CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/u;
const FS_ENCODED_CONTROLS = /%(?:0[0-9a-f]|1[0-9a-f]|7f)/iu;

export function fsPathToLocalRootUri(fsPath: string): ValidatedLocalRootUri {
  if (typeof fsPath !== 'string' || fsPath.length === 0 || FS_CONTROL_CHARS.test(fsPath) || FS_ENCODED_CONTROLS.test(fsPath)) {
    throw new CompanionContractError('PATH_UNSAFE', `Invalid local filesystem path "${String(fsPath)}"`);
  }
  if (fsPath.startsWith('\\\\') || fsPath.startsWith('//') || /^[/\\][?.][/\\]/u.test(fsPath)) {
    throw new CompanionContractError('UNSUPPORTED_REMOTE_AUTHORITY', `UNC and device paths are unsupported: "${fsPath}"`);
  }
  let uriPath: string;
  if (/^[A-Za-z]:(?:[\\/]|$)/u.test(fsPath)) {
    if (/[\\/]{2,}/u.test(fsPath)) {
      throw new CompanionContractError('PATH_UNSAFE', `Filesystem path "${fsPath}" contains empty separator segments`);
    }
    const posixified = fsPath.replace(/\\/gu, '/');
    uriPath = posixified.endsWith(':') ? `/${posixified}/` : `/${posixified}`;
  } else if (fsPath.startsWith('/')) {
    if (fsPath.includes('\\') || fsPath.includes('//')) {
      throw new CompanionContractError('PATH_UNSAFE', `Filesystem path "${fsPath}" must be normalized absolute path`);
    }
    uriPath = fsPath;
  } else {
    throw new CompanionContractError('PATH_UNSAFE', `Filesystem path "${fsPath}" must be an absolute local path`);
  }
  return validateLocalRootUri({ scheme: 'file', path: uriPath });
}

export function readHostRemoteAuthority(vscodeEnv?: {
  readonly remoteName?: string;
  readonly remoteAuthority?: string;
}): string | undefined {
  if (!vscodeEnv) return undefined;
  if (typeof vscodeEnv.remoteName === 'string' && vscodeEnv.remoteName.trim() !== '') {
    return vscodeEnv.remoteName;
  }
  try {
    if (typeof vscodeEnv.remoteAuthority === 'string' && vscodeEnv.remoteAuthority.trim() !== '') {
      return vscodeEnv.remoteAuthority;
    }
  } catch {
    // In VS Code 1.140.0, vscode.env.remoteAuthority requires the 'resolvers' API proposal;
    // vscode.env.remoteName is the public stable property.
  }
  return undefined;
}

export interface HostGuardStatus {
  readonly qualified: boolean;
  readonly authority: 'local-file' | 'unsupported-remote';
  readonly remoteAuthority: string | null;
  readonly workspaceTrusted: boolean;
  readonly proposalSupported: boolean;
  readonly reason?: string;
}

export interface ActiveInstallationDescriptor {
  readonly source: 'project' | 'home';
  readonly rootIdentity: string;
  readonly rootFsPath: string;
  readonly pluginFsPath: string;
}

export function inspectHostGuard(env?: {
  readonly remoteAuthority?: string | null;
  readonly workspaceTrusted?: boolean;
  readonly hasProposal?: boolean;
}): HostGuardStatus {
  const remoteAuthority = env?.remoteAuthority && env.remoteAuthority.trim() !== '' ? env.remoteAuthority : null;
  if (remoteAuthority !== null) {
    return Object.freeze({
      qualified: false, authority: 'unsupported-remote', remoteAuthority,
      workspaceTrusted: Boolean(env?.workspaceTrusted), proposalSupported: Boolean(env?.hasProposal),
      reason: `Remote authority "${remoteAuthority}" is unsupported; only local file:// roots are supported`
    });
  }
  const workspaceTrusted = Boolean(env?.workspaceTrusted);
  if (!workspaceTrusted) {
    return Object.freeze({
      qualified: false, authority: 'local-file', remoteAuthority: null,
      workspaceTrusted: false, proposalSupported: Boolean(env?.hasProposal),
      reason: 'Installation root loading requires a trusted local workspace'
    });
  }
  const proposalSupported = Boolean(env?.hasProposal);
  if (!proposalSupported) {
    return Object.freeze({
      qualified: false, authority: 'local-file', remoteAuthority: null,
      workspaceTrusted: true, proposalSupported: false,
      reason: 'chatPromptFiles API proposal is not available'
    });
  }
  return Object.freeze({
    qualified: true, authority: 'local-file', remoteAuthority: null,
    workspaceTrusted: true, proposalSupported: true
  });
}

export function inspectCandidateRoot(fsPath: string, approved = false, isProjectRoot = true): CandidateInstallationRoot {
  const uri = fsPathToLocalRootUri(fsPath);
  let pluginDir: string | null = null;
  if (isProjectRoot) {
    const nestedPlugin = join(fsPath, '.evcrate-vscode');
    if (existsSync(nestedPlugin)) pluginDir = nestedPlugin;
  } else {
    const directManifest = join(fsPath, 'evcrate', 'agent-intent.json');
    const directTemplates = join(fsPath, 'evcrate', 'agent-templates');
    const nestedPlugin = join(fsPath, '.evcrate-vscode');
    if (existsSync(directManifest) && existsSync(directTemplates)) {
      pluginDir = fsPath;
    } else if (existsSync(nestedPlugin)) {
      pluginDir = nestedPlugin;
    }
  }

  let present = false;
  let valid = false;
  if (pluginDir !== null) {
    present = true;
    try {
      const mPath = join(pluginDir, 'evcrate', 'agent-intent.json');
      const tPath = join(pluginDir, 'evcrate', 'agent-templates');
      const mStat = lstatSync(mPath);
      const tStat = lstatSync(tPath);
      if (mStat.isFile() && !mStat.isSymbolicLink() && tStat.isDirectory() && !tStat.isSymbolicLink()) {
        valid = true;
      }
    } catch {
      valid = false;
    }
  }
  return Object.freeze({ uri: uri.rootIdentity, present, valid, approved });
}

export function resolveCandidateRoots(input: {
  readonly workspaceFolderPaths: readonly string[];
  readonly customHomePath?: string;
  readonly explicitSelectedRootIdentity?: string | null;
  readonly approvedRoots?: ReadonlySet<string>;
  readonly workspaceTrusted: boolean;
  readonly remoteAuthority?: string | null;
}): ActiveInstallationDescriptor {
  const isApproved = (uri: string) => (input.approvedRoots ? input.approvedRoots.has(uri) : true);
  const projectRoots = input.workspaceFolderPaths.map((p) => {
    const candidateUri = fsPathToLocalRootUri(p).rootIdentity;
    return inspectCandidateRoot(p, isApproved(candidateUri), true);
  });
  const homePath = input.customHomePath ?? join(homedir(), '.evcrate-vscode');
  const homeCandidateUri = existsSync(homePath) ? fsPathToLocalRootUri(homePath).rootIdentity : null;
  const homeRoot = homeCandidateUri ? inspectCandidateRoot(homePath, isApproved(homeCandidateUri), false) : null;

  const selectionInput: InstallationSelectionInput = {
    workspaceTrusted: input.workspaceTrusted,
    remoteAuthority: input.remoteAuthority,
    projectRoots,
    homeRoot,
    explicitSelectedRootIdentity: input.explicitSelectedRootIdentity
  };
  const resolved = resolveInstallationRoot(selectionInput);
  let resolvedFsPath: string | null = null;
  let resolvedPluginFsPath: string | null = null;
  if (resolved.source === 'project') {
    for (const p of input.workspaceFolderPaths) {
      if (fsPathToLocalRootUri(p).rootIdentity === resolved.rootIdentity) {
        resolvedFsPath = p;
        resolvedPluginFsPath = join(p, '.evcrate-vscode');
        break;
      }
    }
  } else {
    resolvedFsPath = homePath;
    resolvedPluginFsPath = existsSync(join(homePath, 'evcrate', 'agent-intent.json')) ? homePath : join(homePath, '.evcrate-vscode');
  }
  if (!resolvedFsPath || !resolvedPluginFsPath) {
    throw new CompanionContractError('NO_INSTALLATION_FOUND', `Failed to map root identity "${resolved.rootIdentity}" to filesystem path`);
  }
  return Object.freeze({
    source: resolved.source,
    rootIdentity: resolved.rootIdentity,
    rootFsPath: resolvedFsPath,
    pluginFsPath: resolvedPluginFsPath
  });
}
