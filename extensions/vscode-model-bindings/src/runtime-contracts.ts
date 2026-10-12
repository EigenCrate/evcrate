export const VSCODE_EXTENSION_ID = 'eigencrate.evcrate-model-bindings' as const;
export const VSCODE_RUNTIME_DIAGNOSTICS_SCHEMA_V1 = 'evcrate-vscode-runtime-bindings-v1' as const;

export const PINNED_HOST_TUPLE = Object.freeze({
  vscodeVersion: '1.140.0', vscodeCommit: '07f806f999227108933c2e30515b26eecc1fda74',
  copilotChatVersion: '0.68.0', apiProposal: 'chatPromptFiles', extensionKind: Object.freeze(['workspace'] as const)
});

export const STORAGE_AND_SOURCE_BOUNDS = Object.freeze({
  maxEnrolledRoots: 32, maxActorsPerRoot: 512, maxTemplateBytes: 1_048_576, maxGenerationBytes: 16_777_216,
  maxBindingsJsonBytes: 65_536, maxCatalogEntries: 2048, maxActiveInstanceGenerations: 32,
  maxActiveInstanceBytes: 67_108_864, maxPersistentAuthorityBytes: 268_435_456, refreshDebounceMs: 200
});

const SHA256_HEX = /^[0-9a-f]{64}$/u;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ACTOR_ID_PATTERN = /^evc-[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/u;
const ENCODED_CONTROLS = /%(?:0[0-9a-f]|1[0-9a-f]|7f)/iu;

export class CompanionContractError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'CompanionContractError';
    this.code = code;
  }
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return false;
  for (const key of Object.keys(value)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') return false;
  }
  return true;
}

export interface LocalRootUriInput {
  readonly scheme: string; readonly authority?: string; readonly path: string; readonly query?: string; readonly fragment?: string;
}
export interface ValidatedLocalRootUri {
  readonly scheme: 'file'; readonly authority: ''; readonly path: string; readonly rootIdentity: string;
}

export function validateLocalRootUri(input: string | LocalRootUriInput): ValidatedLocalRootUri {
  let scheme: string;
  let authority: string;
  let decodedPath: string;
  if (typeof input === 'string') {
    if (CONTROL_CHARS.test(input) || ENCODED_CONTROLS.test(input)) {
      throw new CompanionContractError('PATH_UNSAFE', 'URI must not contain control characters');
    }
    const match = /^([A-Za-z][A-Za-z0-9+.-]*):\/\/([^/?#]*)([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/u.exec(input);
    if (!match) throw new CompanionContractError('PATH_UNSAFE', `Malformed URI "${input}"`);
    const [, rawScheme, rawAuthority, rawPath, query = '', fragment = ''] = match;
    if (query !== '' || fragment !== '' || /%(?:2f|5c|00)/iu.test(rawPath)) {
      throw new CompanionContractError('PATH_UNSAFE', 'URI must not contain query, fragment, or encoded slash/NUL');
    }
    scheme = rawScheme;
    authority = rawAuthority;
    try {
      decodedPath = decodeURIComponent(rawPath);
    } catch {
      throw new CompanionContractError('PATH_UNSAFE', 'Malformed percent-encoding in URI path');
    }
  } else if (isPlainObject(input) && typeof input.scheme === 'string' && typeof input.path === 'string') {
    if (CONTROL_CHARS.test(input.path) || ENCODED_CONTROLS.test(input.path)) {
      throw new CompanionContractError('PATH_UNSAFE', 'URI must not contain control characters');
    }
    if ((input.query && input.query !== '') || (input.fragment && input.fragment !== '')) {
      throw new CompanionContractError('PATH_UNSAFE', 'URI must not contain query or fragment');
    }
    scheme = input.scheme;
    authority = typeof input.authority === 'string' ? input.authority : '';
    decodedPath = input.path;
  } else {
    throw new CompanionContractError('CONTRACT_INVALID', 'Invalid URI input');
  }
  const normalizedScheme = scheme.toLowerCase();
  const normalizedAuthority = authority.toLowerCase() === 'localhost' ? '' : authority;
  if (normalizedScheme !== 'file' || normalizedAuthority !== '') {
    throw new CompanionContractError('UNSUPPORTED_REMOTE_AUTHORITY', `Unsupported scheme/authority "${scheme}://${authority}"; only local file:// roots are supported`);
  }
  if (CONTROL_CHARS.test(decodedPath) || decodedPath.includes('\\') || !decodedPath.startsWith('/') || decodedPath.includes('//')) {
    throw new CompanionContractError('PATH_UNSAFE', `URI path "${decodedPath}" must be normalized absolute POSIX path`);
  }
  if (decodedPath.split('/').some((seg) => seg === '.' || seg === '..')) {
    throw new CompanionContractError('PATH_UNSAFE', `URI path "${decodedPath}" contains dot traversal segments`);
  }
  const foldedDrive = /^\/[A-Za-z]:(?:\/|$)/u.test(decodedPath) ? `/${decodedPath[1].toLowerCase()}${decodedPath.slice(2)}` : decodedPath;
  const trimmedPath = foldedDrive.length > 1 && foldedDrive.endsWith('/') ? foldedDrive.slice(0, -1) : foldedDrive;
  const encodedPath = trimmedPath.replace(/[%?#]/gu, (ch) => (ch === '%' ? '%25' : ch === '?' ? '%3F' : '%23'));
  return Object.freeze({ scheme: 'file', authority: '', path: trimmedPath, rootIdentity: `file://${encodedPath}` });
}

export interface CandidateInstallationRoot {
  readonly uri: string | LocalRootUriInput; readonly present: boolean; readonly valid: boolean; readonly approved: boolean;
}
export interface InstallationSelectionInput {
  readonly workspaceTrusted: boolean; readonly remoteAuthority?: string | null;
  readonly projectRoots: readonly CandidateInstallationRoot[]; readonly homeRoot?: CandidateInstallationRoot | null;
  readonly explicitSelectedRootIdentity?: string | null;
}
export function resolveInstallationRoot(
  input: InstallationSelectionInput
): { readonly source: 'project' | 'home'; readonly rootIdentity: string } {
  if (typeof input.remoteAuthority === 'string' && input.remoteAuthority.trim() !== '') {
    throw new CompanionContractError('UNSUPPORTED_REMOTE_AUTHORITY', `Remote authority "${input.remoteAuthority}" is unsupported`);
  }
  if (input.projectRoots.length > STORAGE_AND_SOURCE_BOUNDS.maxEnrolledRoots) {
    throw new CompanionContractError('BOUNDS_EXCEEDED', 'Exceeded maximum enrolled roots');
  }
  if (!input.workspaceTrusted) {
    throw new CompanionContractError('WORKSPACE_UNTRUSTED', 'Installation root loading requires a trusted local workspace');
  }
  if (input.projectRoots.length > 1 || input.explicitSelectedRootIdentity) {
    const presentProjects = input.projectRoots.filter((r) => r.present);
    if (input.projectRoots.length > 1 && presentProjects.length > 0 && !input.explicitSelectedRootIdentity) {
      throw new CompanionContractError('MULTI_ROOT_SELECTION_REQUIRED', 'Explicit root selection required in multi-root workspace');
    }
    if (input.explicitSelectedRootIdentity) {
      for (const candidate of presentProjects) {
        const validated = validateLocalRootUri(candidate.uri);
        if (validated.rootIdentity === input.explicitSelectedRootIdentity) {
          if (!candidate.valid || !candidate.approved) {
            throw new CompanionContractError('PROJECT_INSTALLATION_INVALID', 'Selected project installation is invalid or unapproved');
          }
          return Object.freeze({ source: 'project', rootIdentity: validated.rootIdentity });
        }
      }
      if (presentProjects.length === 0 && input.homeRoot?.present) {
        const validatedHome = validateLocalRootUri(input.homeRoot.uri);
        if (validatedHome.rootIdentity === input.explicitSelectedRootIdentity) {
          if (!input.homeRoot.valid || !input.homeRoot.approved) {
            throw new CompanionContractError('HOME_INSTALLATION_INVALID', 'Selected HOME installation is invalid or unapproved');
          }
          return Object.freeze({ source: 'home', rootIdentity: validatedHome.rootIdentity });
        }
      }
      throw new CompanionContractError('MULTI_ROOT_SELECTION_REQUIRED', 'Explicitly selected root not found among active installations');
    }
  }
  if (input.projectRoots.length === 1 && input.projectRoots[0].present) {
    const project = input.projectRoots[0];
    const validated = validateLocalRootUri(project.uri);
    if (!project.valid || !project.approved) {
      throw new CompanionContractError('PROJECT_INSTALLATION_INVALID', 'Project installation is invalid or unapproved; refusing HOME fallback');
    }
    return Object.freeze({ source: 'project', rootIdentity: validated.rootIdentity });
  }
  if (input.homeRoot?.present) {
    const validatedHome = validateLocalRootUri(input.homeRoot.uri);
    if (!input.homeRoot.valid || !input.homeRoot.approved) {
      throw new CompanionContractError('HOME_INSTALLATION_INVALID', 'HOME installation is invalid or unapproved');
    }
    return Object.freeze({ source: 'home', rootIdentity: validatedHome.rootIdentity });
  }
  throw new CompanionContractError('NO_INSTALLATION_FOUND', 'No valid project or HOME EVCrate installation found');
}

export function buildGenerationStoragePath(rootIdentityHash: string, instanceUuid: string, generationId: number): string {
  if (!SHA256_HEX.test(rootIdentityHash)) throw new CompanionContractError('HASH_MISMATCH', 'Invalid rootIdentityHash');
  if (!UUID_V4.test(instanceUuid)) throw new CompanionContractError('CONTRACT_INVALID', 'Invalid instanceUuid');
  if (!Number.isSafeInteger(generationId) || generationId <= 0) {
    throw new CompanionContractError('CONTRACT_INVALID', 'generationId must be a positive integer');
  }
  return `resolved/${rootIdentityHash}/${instanceUuid.toLowerCase()}/gen-${generationId}`;
}

export function evaluateStorageBudget(usage: {
  readonly activeInstanceGenerations: number; readonly activeInstanceBytes: number;
  readonly persistentAuthorityBytes: number; readonly newGenerationBytes: number;
}): { readonly allowed: boolean; readonly code: 'OK' | 'STORAGE_BUDGET_EXCEEDED'; readonly requiresClosedEditorManualCleanup: boolean } {
  const nums = [usage.activeInstanceGenerations, usage.activeInstanceBytes, usage.persistentAuthorityBytes, usage.newGenerationBytes];
  if (!nums.every((n) => Number.isSafeInteger(n) && n >= 0) || usage.newGenerationBytes < 1) {
    throw new CompanionContractError('CONTRACT_INVALID', 'Storage budget inputs must be safe non-negative integers (newGenerationBytes >= 1)');
  }
  const exceeded = usage.newGenerationBytes > STORAGE_AND_SOURCE_BOUNDS.maxGenerationBytes
    || usage.activeInstanceGenerations + 1 > STORAGE_AND_SOURCE_BOUNDS.maxActiveInstanceGenerations
    || usage.activeInstanceBytes + usage.newGenerationBytes > STORAGE_AND_SOURCE_BOUNDS.maxActiveInstanceBytes
    || usage.persistentAuthorityBytes + usage.newGenerationBytes > STORAGE_AND_SOURCE_BOUNDS.maxPersistentAuthorityBytes;
  return exceeded
    ? Object.freeze({ allowed: false, code: 'STORAGE_BUDGET_EXCEEDED', requiresClosedEditorManualCleanup: true })
    : Object.freeze({ allowed: true, code: 'OK', requiresClosedEditorManualCleanup: false });
}

export function canReclaimGeneration(input: {
  readonly ownerInstanceUuid: string; readonly currentInstanceUuid: string; readonly isActiveTurnGeneration: boolean;
  readonly automaticReclamationProven: boolean; readonly allEditorWindowsClosed: boolean; readonly referencingSessionsRetired: boolean;
}): boolean {
  if (input.isActiveTurnGeneration) return false;
  if (input.allEditorWindowsClosed && input.referencingSessionsRetired) return true;
  return input.ownerInstanceUuid === input.currentInstanceUuid && input.automaticReclamationProven;
}

export { ACTOR_ID_PATTERN, SHA256_HEX, UUID_V4 };
