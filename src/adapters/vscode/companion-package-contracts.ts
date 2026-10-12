export const VSCODE_EXTENSION_ID = 'eigencrate.evcrate-model-bindings' as const;
export const VSCODE_PROPOSED_API_FLAG = '--enable-proposed-api=eigencrate.evcrate-model-bindings' as const;
export const VSCODE_COMPANION_DESCRIPTOR_SCHEMA_V1 = 'evcrate-vscode-companion-descriptor-v1' as const;
export const VSCODE_COMPANION_SOURCE_RECEIPT_SCHEMA_V1 = 'evcrate-vscode-companion-source-receipt-v1' as const;
export const VSCODE_COMPANION_INSTALL_SCHEMA_V1 = 'evcrate-vscode-companion-install-v1' as const;
export const COMPANION_INSTALL_TIMEOUT_MS = 120_000;
export const COMPANION_INSTALL_MAX_STREAM_BYTES = 1_048_576;

export const PINNED_VSCODE_HOST_TUPLE = Object.freeze({
  vscodeVersion: '1.140.0',
  vscodeCommit: '07f806f999227108933c2e30515b26eecc1fda74',
  copilotChatVersion: '0.68.0',
  apiProposal: 'chatPromptFiles',
  extensionKind: Object.freeze(['workspace'] as const)
});

export type CompanionInstallStatus =
  | 'installed'
  | 'already-installed'
  | 'skipped'
  | 'declined'
  | 'manual-setup-required'
  | 'failed';

export interface VscodeCompanionDescriptorV1 {
  readonly schema: typeof VSCODE_COMPANION_DESCRIPTOR_SCHEMA_V1;
  readonly extensionId: typeof VSCODE_EXTENSION_ID;
  readonly version: string;
  readonly buildIdentity: string;
  readonly vsixRelativePath: string;
  readonly vsixSha256: string;
  readonly supportedHost: typeof PINNED_VSCODE_HOST_TUPLE;
  readonly intentSchema: 'evcrate-vscode-agent-intent-v1';
}

export interface VscodeCompanionSourceReceiptV1 {
  readonly schema: typeof VSCODE_COMPANION_SOURCE_RECEIPT_SCHEMA_V1;
  readonly extensionId: typeof VSCODE_EXTENSION_ID;
  readonly version: string;
  readonly buildIdentity: string;
  readonly inputs: Readonly<Record<string, string>>;
  readonly toolIdentities: Readonly<Record<string, string>>;
}

export interface VscodeCompanionInstallNoticeV1 {
  readonly schema: typeof VSCODE_COMPANION_INSTALL_SCHEMA_V1;
  readonly publication: 'committed';
  readonly status: CompanionInstallStatus;
  readonly requested: boolean;
  readonly exitCode: 0 | 5;
  readonly extensionId: typeof VSCODE_EXTENSION_ID;
  readonly version: string;
  readonly buildIdentity: string | null;
  readonly editor: string | null;
  readonly profile: string | null;
  readonly reason: string;
  readonly proposedApiFlag: typeof VSCODE_PROPOSED_API_FLAG;
}

export const SHA256_HEX = /^[0-9a-f]{64}$/u;
export const SEMVER_EXACT = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;
export const SAFE_REL_PATH = /^(?!\/)(?!.*\/\/)(?!.*(?:^|\/)\.{1,2}(?:\/|$))[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/u;

export class ContractValidationError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ContractValidationError';
    this.code = code;
  }
}

export function isSafePlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return false;
  for (const key of Object.keys(value)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') return false;
  }
  return true;
}

export function assertExactKeys(record: Record<string, unknown>, allowed: readonly string[], context: string): void {
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) {
      throw new ContractValidationError('CONTRACT_INVALID', `Unexpected key "${key}" in ${context}`);
    }
  }
}

export function validateCompanionDescriptor(input: unknown): VscodeCompanionDescriptorV1 {
  if (!isSafePlainRecord(input)) throw new ContractValidationError('CONTRACT_INVALID', 'Descriptor must be a plain object');
  if (input.schema !== VSCODE_COMPANION_DESCRIPTOR_SCHEMA_V1) {
    throw new ContractValidationError('SCHEMA_UNSUPPORTED', `Unsupported descriptor schema: ${String(input.schema)}`);
  }
  assertExactKeys(input, [
    'schema', 'extensionId', 'version', 'buildIdentity', 'vsixRelativePath', 'vsixSha256', 'supportedHost', 'intentSchema'
  ], 'companion descriptor');
  if (input.extensionId !== VSCODE_EXTENSION_ID) throw new ContractValidationError('CONTRACT_INVALID', 'Invalid extensionId');
  if (typeof input.version !== 'string' || !SEMVER_EXACT.test(input.version)) {
    throw new ContractValidationError('CONTRACT_INVALID', 'Invalid descriptor version');
  }
  if (typeof input.buildIdentity !== 'string' || !SHA256_HEX.test(input.buildIdentity)) {
    throw new ContractValidationError('HASH_MISMATCH', 'Invalid buildIdentity digest');
  }
  const expectedRel = `evcrate/companion/evcrate-model-bindings-${input.version}.vsix`;
  if (input.vsixRelativePath !== expectedRel || !SAFE_REL_PATH.test(input.vsixRelativePath)) {
    throw new ContractValidationError('PATH_UNSAFE', 'Invalid vsixRelativePath');
  }
  if (typeof input.vsixSha256 !== 'string' || !SHA256_HEX.test(input.vsixSha256)) {
    throw new ContractValidationError('HASH_MISMATCH', 'Invalid vsixSha256 digest');
  }
  if (input.intentSchema !== 'evcrate-vscode-agent-intent-v1') {
    throw new ContractValidationError('SCHEMA_UNSUPPORTED', 'Invalid intentSchema in descriptor');
  }
  if (!isSafePlainRecord(input.supportedHost)) throw new ContractValidationError('CONTRACT_INVALID', 'Invalid supportedHost');
  const host = input.supportedHost;
  if (
    host.vscodeVersion !== PINNED_VSCODE_HOST_TUPLE.vscodeVersion
    || host.vscodeCommit !== PINNED_VSCODE_HOST_TUPLE.vscodeCommit
    || host.copilotChatVersion !== PINNED_VSCODE_HOST_TUPLE.copilotChatVersion
    || host.apiProposal !== PINNED_VSCODE_HOST_TUPLE.apiProposal
    || !Array.isArray(host.extensionKind)
    || host.extensionKind.length !== 1
    || host.extensionKind[0] !== 'workspace'
  ) {
    throw new ContractValidationError('CONTRACT_INVALID', 'Descriptor supportedHost does not match pinned host tuple');
  }
  return Object.freeze({
    schema: VSCODE_COMPANION_DESCRIPTOR_SCHEMA_V1,
    extensionId: VSCODE_EXTENSION_ID,
    version: input.version,
    buildIdentity: input.buildIdentity,
    vsixRelativePath: input.vsixRelativePath,
    vsixSha256: input.vsixSha256,
    supportedHost: PINNED_VSCODE_HOST_TUPLE,
    intentSchema: 'evcrate-vscode-agent-intent-v1'
  });
}

export function validateCompanionSourceReceipt(
  input: unknown,
  options?: { readonly releaseImmutableIdentity?: string }
): VscodeCompanionSourceReceiptV1 {
  if (!isSafePlainRecord(input)) throw new ContractValidationError('CONTRACT_INVALID', 'Receipt must be a plain object');
  if (input.schema !== VSCODE_COMPANION_SOURCE_RECEIPT_SCHEMA_V1) {
    throw new ContractValidationError('SCHEMA_UNSUPPORTED', `Unsupported receipt schema: ${String(input.schema)}`);
  }
  assertExactKeys(input, ['schema', 'extensionId', 'version', 'buildIdentity', 'inputs', 'toolIdentities'], 'source receipt');
  if (input.extensionId !== VSCODE_EXTENSION_ID) throw new ContractValidationError('CONTRACT_INVALID', 'Invalid extensionId');
  if (typeof input.version !== 'string' || !SEMVER_EXACT.test(input.version)) {
    throw new ContractValidationError('CONTRACT_INVALID', 'Invalid receipt version');
  }
  if (typeof input.buildIdentity !== 'string' || !SHA256_HEX.test(input.buildIdentity)) {
    throw new ContractValidationError('HASH_MISMATCH', 'Invalid receipt buildIdentity');
  }
  if (options?.releaseImmutableIdentity && options.releaseImmutableIdentity !== input.buildIdentity) {
    throw new ContractValidationError('BUILD_IDENTITY_IMMUTABLE_VIOLATION', 'Release version buildIdentity is immutable');
  }
  if (!isSafePlainRecord(input.inputs) || Object.keys(input.inputs).length === 0) {
    throw new ContractValidationError('CONTRACT_INVALID', 'Receipt inputs must be a non-empty map');
  }
  for (const [relPath, digest] of Object.entries(input.inputs)) {
    if (!SAFE_REL_PATH.test(relPath) || relPath.endsWith('.vsix') || relPath.includes('evcrate/companion/')) {
      throw new ContractValidationError('PATH_UNSAFE', `Receipt input path "${relPath}" is unsafe or self-referential`);
    }
    if (typeof digest !== 'string' || !SHA256_HEX.test(digest)) {
      throw new ContractValidationError('HASH_MISMATCH', `Invalid digest for input "${relPath}"`);
    }
  }
  if (!isSafePlainRecord(input.toolIdentities) || Object.keys(input.toolIdentities).length === 0) {
    throw new ContractValidationError('CONTRACT_INVALID', 'Receipt toolIdentities must be non-empty');
  }
  for (const [tool, ver] of Object.entries(input.toolIdentities)) {
    if (!tool || typeof ver !== 'string' || ver.trim() === '') {
      throw new ContractValidationError('CONTRACT_INVALID', `Invalid tool identity "${tool}"`);
    }
  }
  return Object.freeze({
    schema: VSCODE_COMPANION_SOURCE_RECEIPT_SCHEMA_V1,
    extensionId: VSCODE_EXTENSION_ID,
    version: input.version,
    buildIdentity: input.buildIdentity,
    inputs: Object.freeze({ ...(input.inputs as Record<string, string>) }),
    toolIdentities: Object.freeze({ ...(input.toolIdentities as Record<string, string>) })
  });
}
