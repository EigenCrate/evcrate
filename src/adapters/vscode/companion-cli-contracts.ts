import {
  ContractValidationError,
  SEMVER_EXACT,
  SHA256_HEX,
  VSCODE_COMPANION_INSTALL_SCHEMA_V1,
  VSCODE_EXTENSION_ID,
  VSCODE_PROPOSED_API_FLAG,
  assertExactKeys,
  isSafePlainRecord,
  validateCompanionDescriptor,
  validateCompanionSourceReceipt,
  type CompanionInstallStatus,
  type VscodeCompanionDescriptorV1,
  type VscodeCompanionInstallNoticeV1,
  type VscodeCompanionSourceReceiptV1
} from './companion-package-contracts.js';

const SAFE_PROFILE_NAME = /^[^\0/\\\r\n\t]{1,128}$/u;
const VALID_INSTALL_STATUSES: Record<CompanionInstallStatus, true> = {
  installed: true, 'already-installed': true, skipped: true, declined: true, 'manual-setup-required': true, failed: true
};

export interface CompanionLayoutVerificationInput {
  readonly mode: 'development-checkout' | 'packed-package';
  readonly descriptor: unknown;
  readonly sourceReceipt: unknown;
  readonly actualVsixSha256: string;
  readonly manifestVsixSha256: string;
  readonly liveInputDigests?: Readonly<Record<string, string>>;
}

export interface CompanionLayoutVerificationResult {
  readonly mode: 'development-checkout' | 'packed-package';
  readonly descriptor: VscodeCompanionDescriptorV1;
  readonly sourceReceipt: VscodeCompanionSourceReceiptV1;
  readonly checkoutFreshnessVerified: boolean;
}

export function verifyCompanionLayoutContract(
  input: CompanionLayoutVerificationInput
): CompanionLayoutVerificationResult {
  if (!isSafePlainRecord(input)) throw new ContractValidationError('CONTRACT_INVALID', 'Layout verification input must be an object');
  if (input.mode !== 'development-checkout' && input.mode !== 'packed-package') {
    throw new ContractValidationError('CONTRACT_INVALID', `Explicit verification mode required; got "${String(input.mode)}"`);
  }
  const descriptor = validateCompanionDescriptor(input.descriptor);
  const sourceReceipt = validateCompanionSourceReceipt(input.sourceReceipt);
  if (descriptor.version !== sourceReceipt.version || descriptor.buildIdentity !== sourceReceipt.buildIdentity) {
    throw new ContractValidationError('HASH_MISMATCH', 'Descriptor version/buildIdentity mismatches source receipt');
  }
  if (
    typeof input.actualVsixSha256 !== 'string' || !SHA256_HEX.test(input.actualVsixSha256)
    || input.actualVsixSha256 !== descriptor.vsixSha256 || input.manifestVsixSha256 !== descriptor.vsixSha256
  ) {
    throw new ContractValidationError('HASH_MISMATCH', 'VSIX SHA-256 mismatches descriptor or BuildManifest');
  }
  if (input.mode === 'development-checkout') {
    if (!isSafePlainRecord(input.liveInputDigests)) {
      throw new ContractValidationError('MISSING_CHECKOUT_INPUT', 'Development checkout verification requires liveInputDigests');
    }
    for (const [relPath, expectedHash] of Object.entries(sourceReceipt.inputs)) {
      const liveHash = input.liveInputDigests[relPath];
      if (typeof liveHash !== 'string') throw new ContractValidationError('MISSING_CHECKOUT_INPUT', `Missing checkout source input "${relPath}"`);
      if (liveHash !== expectedHash) throw new ContractValidationError('STALE_CHECKOUT_INPUT', `Stale checkout source input "${relPath}"`);
    }
    for (const liveKey of Object.keys(input.liveInputDigests)) {
      if (!Object.hasOwn(sourceReceipt.inputs, liveKey)) {
        throw new ContractValidationError('STALE_CHECKOUT_INPUT', `Unrecorded checkout input "${liveKey}"`);
      }
    }
    return Object.freeze({ mode: 'development-checkout', descriptor, sourceReceipt, checkoutFreshnessVerified: true });
  }
  return Object.freeze({ mode: 'packed-package', descriptor, sourceReceipt, checkoutFreshnessVerified: false });
}

export interface CompanionCliFlagInput {
  readonly commandKind: string;
  readonly commandAction?: string;
  readonly targets: readonly string[];
  readonly installVscodeCompanion?: boolean;
  readonly noInstallVscodeCompanion?: boolean;
  readonly vscodeEditor?: string;
  readonly vscodeProfile?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
}

export interface ValidatedCompanionCliOptions {
  readonly companionInstallPolicy: 'explicit-install' | 'explicit-skip' | 'default-prompt';
  readonly vscodeEditor: string | null;
  readonly vscodeProfile: string | null;
  readonly remoteContextUnsupported: boolean;
}

export function validateCompanionCliOptions(input: CompanionCliFlagInput): ValidatedCompanionCliOptions {
  if (input.installVscodeCompanion === true && input.noInstallVscodeCompanion === true) {
    throw new ContractValidationError('USAGE_INVALID', 'Contradictory companion installation flags');
  }
  const hasAnyFlag =
    input.installVscodeCompanion !== undefined
    || input.noInstallVscodeCompanion !== undefined
    || input.vscodeEditor !== undefined
    || input.vscodeProfile !== undefined;

  const eligibleCommand =
    (input.commandKind === 'publish' && (input.commandAction === 'apply' || input.commandAction === 'dry-run'))
    || (input.commandKind === 'distribute' && (input.commandAction === 'publish' || input.commandAction === 'all'))
    || input.commandKind === 'request-file';

  if (hasAnyFlag && !eligibleCommand) {
    throw new ContractValidationError('USAGE_INVALID', 'Companion flags are only valid on publish operations');
  }
  if (hasAnyFlag && input.targets.length > 0 && !input.targets.includes('vscode')) {
    throw new ContractValidationError('VALIDATION_INVALID', 'Companion flags require target "vscode"');
  }
  let vscodeEditor: string | null = null;
  if (input.vscodeEditor !== undefined) {
    const isAbs = input.vscodeEditor.startsWith('/') || /^[A-Za-z]:[\\/]/u.test(input.vscodeEditor);
    const hasTraversal = /(?:^|[\\/])\.\.(?:[\\/]|$)/u.test(input.vscodeEditor);
    if (!isAbs || hasTraversal || input.vscodeEditor.includes('\0')) {
      throw new ContractValidationError('VALIDATION_INVALID', 'Invalid --vscode-editor executable path');
    }
    vscodeEditor = input.vscodeEditor;
  }
  let vscodeProfile: string | null = null;
  if (input.vscodeProfile !== undefined) {
    const trimmed = input.vscodeProfile.trim();
    if (!SAFE_PROFILE_NAME.test(trimmed)) {
      throw new ContractValidationError('VALIDATION_INVALID', 'Invalid --vscode-profile name');
    }
    vscodeProfile = trimmed;
  }
  const env = input.env ?? {};
  const remoteContextUnsupported = Boolean(
    env.SSH_CONNECTION || env.SSH_CLIENT || env.REMOTE_CONTAINERS || env.CODESPACES || env.WSL_DISTRO_NAME
  );
  const companionInstallPolicy = input.installVscodeCompanion === true
    ? 'explicit-install'
    : input.noInstallVscodeCompanion === true ? 'explicit-skip' : 'default-prompt';
  return Object.freeze({ companionInstallPolicy, vscodeEditor, vscodeProfile, remoteContextUnsupported });
}

export function validateCompanionInstallNotice(input: unknown): VscodeCompanionInstallNoticeV1 {
  if (!isSafePlainRecord(input)) throw new ContractValidationError('CONTRACT_INVALID', 'Install notice must be a plain object');
  if (input.schema !== VSCODE_COMPANION_INSTALL_SCHEMA_V1) {
    throw new ContractValidationError('SCHEMA_UNSUPPORTED', `Unsupported install notice schema: ${String(input.schema)}`);
  }
  assertExactKeys(input, [
    'schema', 'publication', 'status', 'requested', 'exitCode',
    'extensionId', 'version', 'buildIdentity', 'editor', 'profile', 'reason', 'proposedApiFlag'
  ], 'companion install notice');
  if (input.publication !== 'committed') {
    throw new ContractValidationError('CONTRACT_INVALID', 'Install notice requires publication="committed"');
  }
  if (typeof input.status !== 'string' || !Object.hasOwn(VALID_INSTALL_STATUSES, input.status)) {
    throw new ContractValidationError('CONTRACT_INVALID', `Invalid install status "${String(input.status)}"`);
  }
  const status = input.status as CompanionInstallStatus;
  if (typeof input.requested !== 'boolean') throw new ContractValidationError('CONTRACT_INVALID', 'requested must be boolean');
  const expectedExitCode = input.requested && (status === 'failed' || status === 'manual-setup-required') ? 5 : 0;
  if (input.exitCode !== expectedExitCode) {
    throw new ContractValidationError('CONTRACT_INVALID', `Expected exitCode=${expectedExitCode} for status="${status}" (requested=${String(input.requested)})`);
  }
  if (input.extensionId !== VSCODE_EXTENSION_ID || input.proposedApiFlag !== VSCODE_PROPOSED_API_FLAG) {
    throw new ContractValidationError('CONTRACT_INVALID', 'Invalid extensionId or proposedApiFlag');
  }
  if (typeof input.version !== 'string' || !SEMVER_EXACT.test(input.version)) {
    throw new ContractValidationError('CONTRACT_INVALID', 'Invalid version in install notice');
  }
  if (input.buildIdentity !== null && (typeof input.buildIdentity !== 'string' || !SHA256_HEX.test(input.buildIdentity))) {
    throw new ContractValidationError('HASH_MISMATCH', 'Invalid buildIdentity in install notice');
  }
  if (input.editor !== null && (typeof input.editor !== 'string' || input.editor.trim() === '')) {
    throw new ContractValidationError('CONTRACT_INVALID', 'Invalid editor field in install notice');
  }
  if (input.profile !== null && (typeof input.profile !== 'string' || input.profile.trim() === '')) {
    throw new ContractValidationError('CONTRACT_INVALID', 'Invalid profile field in install notice');
  }
  if (typeof input.reason !== 'string' || input.reason.trim() === '') {
    throw new ContractValidationError('CONTRACT_INVALID', 'Install notice reason must be non-empty');
  }
  return Object.freeze({
    schema: VSCODE_COMPANION_INSTALL_SCHEMA_V1,
    publication: 'committed',
    status,
    requested: input.requested,
    exitCode: expectedExitCode,
    extensionId: VSCODE_EXTENSION_ID,
    version: input.version,
    buildIdentity: input.buildIdentity as string | null,
    editor: input.editor as string | null,
    profile: input.profile as string | null,
    reason: input.reason,
    proposedApiFlag: VSCODE_PROPOSED_API_FLAG
  });
}
