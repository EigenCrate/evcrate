import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { ControlPlaneError } from '../../errors/control-plane-error.js';

export type {
  InstallationScope,
  InstallationRoots,
  ExplicitInstallationRoots,
  ResolveProjectIdentityOptions,
  ProjectIdentity,
  ResolveProjectIdentityResult,
  CreateSessionContextInput,
  NativeSessionContext,
  StatelessContext,
  SessionContext
} from './session-context-types.js';

import type {
  InstallationScope,
  InstallationRoots,
  ExplicitInstallationRoots,
  ResolveProjectIdentityOptions,
  CreateSessionContextInput,
  SessionContext,
  ResolveProjectIdentityResult
} from './session-context-types.js';


function canonicalPath(p: string): string {
  try {
    return fs.realpathSync(path.resolve(p));
  } catch {
    return path.resolve(p);
  }
}

export function getUserKey(): string {
  let username = 'default';
  try {
    username = os.userInfo().username || 'default';
  } catch {
    username = process.env.USER || process.env.USERNAME || 'default';
  }
  return crypto.createHash('sha256').update(username, 'utf8').digest('hex').slice(0, 16);
}

export function getSessionStatePath(projectKey: string, sessionKey: string, tmpDir: string = os.tmpdir()): string {
  const userKey = getUserKey();
  return path.join(tmpDir, 'evcrate', 'vscode', 'v1', userKey, projectKey, `${sessionKey}.json`);
}

export function computeProjectKey(canonicalProjectRoot: string): string {
  return crypto.createHash('sha256').update(JSON.stringify(['vscode', canonicalProjectRoot]), 'utf8').digest('hex');
}

export function computeSessionKey(projectKey: string, nativeSessionId: string): string {
  return crypto.createHash('sha256').update(JSON.stringify([projectKey, nativeSessionId]), 'utf8').digest('hex');
}

export function findPluginRoot(selfFile: string): string {
  let current = path.dirname(path.resolve(selfFile));
  while (true) {
    if (path.basename(current) === '.evcrate-vscode') {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  throw new ControlPlaneError('VALIDATION_INVALID');
}

export function resolveInstallationRoots(
  selfFile: string,
  explicitRoots?: ExplicitInstallationRoots
): InstallationRoots {
  const rawPluginRoot = findPluginRoot(selfFile);
  const pluginRoot = canonicalPath(rawPluginRoot);

  let scope: InstallationScope;
  let boundRoot: string;

  if (explicitRoots) {
    const rawHome = explicitRoots.homeRoot ? canonicalPath(explicitRoots.homeRoot) : null;
    const rawProject = explicitRoots.projectRoot ? canonicalPath(explicitRoots.projectRoot) : null;

    if (rawHome && rawProject && rawHome === rawProject) {
      throw new ControlPlaneError('VALIDATION_INVALID');
    }

    const expectedHomePlugin = rawHome ? canonicalPath(path.join(rawHome, '.evcrate-vscode')) : null;
    const expectedProjectPlugin = rawProject ? canonicalPath(path.join(rawProject, '.evcrate-vscode')) : null;

    const matchesHome = expectedHomePlugin !== null && pluginRoot === expectedHomePlugin;
    const matchesProject = expectedProjectPlugin !== null && pluginRoot === expectedProjectPlugin;

    if (matchesHome && matchesProject) {
      throw new ControlPlaneError('VALIDATION_INVALID');
    } else if (matchesHome) {
      scope = 'home';
      boundRoot = rawHome!;
    } else if (matchesProject) {
      scope = 'project';
      boundRoot = rawProject!;
    } else {
      throw new ControlPlaneError('VALIDATION_INVALID');
    }
  } else {
    boundRoot = canonicalPath(path.dirname(pluginRoot));
    const homeDir = canonicalPath(os.homedir());
    scope = boundRoot === homeDir ? 'home' : 'project';
  }

  const supportRoot = path.join(pluginRoot, 'evcrate');
  return {
    scope,
    pluginRoot,
    supportRoot,
    workflowsRoot: path.join(supportRoot, 'workflows'),
    scriptsRoot: path.join(supportRoot, 'scripts'),
    catalogsRoot: path.join(supportRoot, 'catalogs'),
    skillsRoot: path.join(pluginRoot, 'skills'),
    boundRoot
  };
}

export function resolveProjectIdentity(options: ResolveProjectIdentityOptions): ResolveProjectIdentityResult {
  const { installationRoots, nativeCwd, explicitProjectRoot, qualifiedWorkspaceContract } = options;

  if (installationRoots.scope === 'project') {
    const bound = installationRoots.boundRoot;

    if (explicitProjectRoot) {
      const canonicalExplicit = canonicalPath(explicitProjectRoot);
      if (canonicalExplicit !== bound) {
        return {
          status: 'unavailable',
          reason: 'SESSION_CONTEXT_PROJECT_MISMATCH'
        };
      }
    }

    if (nativeCwd) {
      const canonicalCwd = canonicalPath(nativeCwd);
      const isInside = canonicalCwd === bound || canonicalCwd.startsWith(bound + path.sep);
      if (!isInside) {
        return {
          status: 'unavailable',
          reason: 'PROJECT_CONTEXT_UNAVAILABLE'
        };
      }
    }

    return {
      status: 'available',
      identity: {
        projectRoot: bound,
        projectKey: computeProjectKey(bound)
      }
    };
  }

  // scope === 'home'
  if (explicitProjectRoot && qualifiedWorkspaceContract) {
    const canonicalExplicit = canonicalPath(explicitProjectRoot);
    if (nativeCwd) {
      const canonicalCwd = canonicalPath(nativeCwd);
      const isInside = canonicalCwd === canonicalExplicit || canonicalCwd.startsWith(canonicalExplicit + path.sep);
      if (!isInside) {
        return {
          status: 'unavailable',
          reason: 'PROJECT_CONTEXT_UNAVAILABLE'
        };
      }
    }

    return {
      status: 'available',
      identity: {
        projectRoot: canonicalExplicit,
        projectKey: computeProjectKey(canonicalExplicit)
      }
    };
  }

  return {
    status: 'unavailable',
    reason: 'PROJECT_CONTEXT_UNAVAILABLE'
  };
}

export function createSessionContext(
  input: CreateSessionContextInput,
  roots: InstallationRoots,
  options?: { qualifiedWorkspaceContract?: boolean; tmpDir?: string }
): SessionContext {
  const { sessionId, cwd, explicitProjectRoot } = input;

  if (!sessionId || typeof sessionId !== 'string' || sessionId.trim().length === 0) {
    return {
      kind: 'stateless',
      target: 'vscode',
      projectRoot: null,
      projectKey: null,
      reason: 'SESSION_ID_MISSING'
    };
  }

  const byteLen = Buffer.byteLength(sessionId, 'utf8');
  if (byteLen > 256) {
    return {
      kind: 'stateless',
      target: 'vscode',
      projectRoot: null,
      projectKey: null,
      reason: 'SESSION_ID_INVALID_LENGTH'
    };
  }

  if (/[\x00-\x1F\x7F]/.test(sessionId)) {
    return {
      kind: 'stateless',
      target: 'vscode',
      projectRoot: null,
      projectKey: null,
      reason: 'SESSION_ID_CONTROL_CHARS'
    };
  }

  const identityResult = resolveProjectIdentity({
    installationRoots: roots,
    nativeCwd: cwd,
    explicitProjectRoot,
    qualifiedWorkspaceContract: options?.qualifiedWorkspaceContract
  });

  if (identityResult.status === 'unavailable') {
    return {
      kind: 'stateless',
      target: 'vscode',
      projectRoot: null,
      projectKey: null,
      reason: identityResult.reason
    };
  }

  const projectRoot = identityResult.identity.projectRoot;
  const projectKey = identityResult.identity.projectKey;
  const sessionKey = computeSessionKey(projectKey, sessionId);
  const handle = getSessionStatePath(projectKey, sessionKey, options?.tmpDir);

  return {
    kind: 'native',
    target: 'vscode',
    projectRoot,
    projectKey,
    sessionKey,
    nativeSessionId: sessionId,
    handle
  };
}
