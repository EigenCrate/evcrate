import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MAX_ACTORS_PER_ROOT, MAX_TEMPLATE_BYTES, VSCODE_AGENT_INTENT_SCHEMA_V1, VSCODE_AGENT_TOOL_AUDIT_SCHEMA_V2,
  VSCODE_CANONICAL_TIERS, resolveCanonicalModelIntent, validateAgentIntentManifest, validateAgentToolAuditV2
} from '../../dist/adapters/vscode/model-intent.js';
import {
  PINNED_VSCODE_HOST_TUPLE, VSCODE_COMPANION_DESCRIPTOR_SCHEMA_V1, VSCODE_COMPANION_INSTALL_SCHEMA_V1,
  VSCODE_COMPANION_SOURCE_RECEIPT_SCHEMA_V1, VSCODE_EXTENSION_ID, VSCODE_PROPOSED_API_FLAG,
  validateCompanionDescriptor, validateCompanionSourceReceipt
} from '../../dist/adapters/vscode/companion-package-contracts.js';
import {
  validateCompanionCliOptions, validateCompanionInstallNotice, verifyCompanionLayoutContract
} from '../../dist/adapters/vscode/companion-cli-contracts.js';
import {
  CANONICAL_TIERS, PINNED_HOST_TUPLE, STORAGE_AND_SOURCE_BOUNDS, VSCODE_BINDINGS_SCHEMA_V1,
  VSCODE_EXTENSION_ID as EXT_ID, VSCODE_RUNTIME_DIAGNOSTICS_SCHEMA_V1, buildGenerationStoragePath,
  canReclaimGeneration, evaluateStorageBudget, formatCatalogSelector, resolveCatalogModelSelector,
  resolveEffectiveActorBinding, resolveInstallationRoot, validateBindingsV1, validateLocalRootUri,
  validateRuntimeDiagnosticsV1
} from '../../.cache/evcrate/vscode-model-bindings-dist/contracts.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const UUID_1 = '11111111-2222-4333-8444-555555555555';
const UUID_2 = '66666666-7777-4888-9999-aaaaaaaaaaaa';

test('extension package.json and core/extension contract constants maintain strict parity', () => {
  const rootPkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));
  const pkg = JSON.parse(readFileSync(join(process.cwd(), 'extensions/vscode-model-bindings/package.json'), 'utf8'));
  assert.equal(`${pkg.publisher}.${pkg.name}`, VSCODE_EXTENSION_ID);
  assert.equal(EXT_ID, VSCODE_EXTENSION_ID);
  assert.deepEqual(PINNED_HOST_TUPLE, PINNED_VSCODE_HOST_TUPLE);
  assert.deepEqual(CANONICAL_TIERS, VSCODE_CANONICAL_TIERS);
  assert.equal(STORAGE_AND_SOURCE_BOUNDS.maxActorsPerRoot, MAX_ACTORS_PER_ROOT);
  assert.equal(STORAGE_AND_SOURCE_BOUNDS.maxTemplateBytes, MAX_TEMPLATE_BYTES);
  assert.equal(pkg.version, rootPkg.version);
  assert.equal(pkg.engines.vscode, PINNED_VSCODE_HOST_TUPLE.vscodeVersion);
  assert.deepEqual(pkg.extensionKind, ['workspace']);
  assert.deepEqual(pkg.enabledApiProposals, ['chatPromptFiles']);
  assert.deepEqual(pkg.activationEvents, ['onStartupFinished']);
  assert.equal(pkg.capabilities.virtualWorkspaces.supported, false);
  assert.equal(pkg.contributes.commands.length, 5);
});
test('canonical model intent and agent-intent-v1 / audit-v2 schemas enforce strict boundaries', () => {
  assert.deepEqual(resolveCanonicalModelIntent(undefined), { mode: 'inherit', tier: null });
  assert.deepEqual(resolveCanonicalModelIntent('inherit'), { mode: 'inherit', tier: null });
  assert.deepEqual(resolveCanonicalModelIntent('opus'), { mode: 'tier', tier: 'opus' });
  assert.throws(() => resolveCanonicalModelIntent('claude-3-opus'), { code: 'CONTRACT_INVALID' });
  assert.throws(() => resolveCanonicalModelIntent(42), { code: 'CONTRACT_INVALID' });

  const validManifest = {
    schema: VSCODE_AGENT_INTENT_SCHEMA_V1, pluginName: 'evc',
    actors: {
      'evc-planner': {
        actorId: 'evc-planner', sourcePath: '.claude/agents/evc-planner.md',
        templatePath: 'evcrate/agent-templates/evc-planner.md', templateSha256: HASH_A, referenceBase: 'agents',
        intent: { mode: 'tier', tier: 'opus' }, tools: { mapped: ['read/readFile'], dropped: [], explicitNone: false },
        delegation: { allowed: true, agents: ['evc-scout'] }, visibility: { userInvocable: true, disableModelInvocation: false }
      }
    }
  };
  assert.deepEqual(validateAgentIntentManifest(validManifest), validManifest);
  assert.throws(() => validateAgentIntentManifest({ schema: 'evcrate-vscode-model-map-v1' }), { code: 'SCHEMA_UNSUPPORTED' });
  assert.throws(() => validateAgentIntentManifest({
    ...validManifest, actors: { 'evc-planner': { ...validManifest.actors['evc-planner'], templatePath: '../evc-planner.md' } }
  }), { code: 'PATH_UNSAFE' });
  assert.throws(() => validateAgentIntentManifest({
    ...validManifest, actors: { 'evc-planner': { ...validManifest.actors['evc-planner'], templateSha256: 'not-a-sha256' } }
  }), { code: 'HASH_MISMATCH' });

  const validAudit = {
    schema: VSCODE_AGENT_TOOL_AUDIT_SCHEMA_V2,
    agents: {
      'evc-planner': {
        source: '.claude/agents/evc-planner.md', target: 'evcrate/agent-templates/evc-planner.md', templateSha256: HASH_A,
        modelIntent: { source: 'opus', tier: 'opus', disposition: 'tier-required' },
        tools: { mapped: [], dropped: [], explicitNone: true }, delegation: { allowed: false, agents: [] }
      }
    }
  };
  const validatedAudit = validateAgentToolAuditV2(validAudit);
  assert.equal(validatedAudit.schema, VSCODE_AGENT_TOOL_AUDIT_SCHEMA_V2);
  assert.notEqual(validatedAudit.agents['evc-planner'], validAudit.agents['evc-planner']);
  assert.throws(() => validateAgentToolAuditV2({
    ...validAudit,
    agents: { 'evc-planner': { ...validAudit.agents['evc-planner'], modelIntent: { tier: 'opus', disposition: 'tier-required', nativeModel: 'claude-3-opus' } } }
  }), { code: 'CONTRACT_INVALID' });
});

test('companion descriptor, source receipt, layout verifier, and CLI install contracts enforce safety', () => {
  const descriptor = validateCompanionDescriptor({
    schema: VSCODE_COMPANION_DESCRIPTOR_SCHEMA_V1, extensionId: VSCODE_EXTENSION_ID, version: '2.11.0',
    buildIdentity: HASH_A, vsixRelativePath: 'evcrate/companion/evcrate-model-bindings-2.11.0.vsix',
    vsixSha256: HASH_B, supportedHost: PINNED_VSCODE_HOST_TUPLE, intentSchema: VSCODE_AGENT_INTENT_SCHEMA_V1
  });
  const receipt = validateCompanionSourceReceipt({
    schema: VSCODE_COMPANION_SOURCE_RECEIPT_SCHEMA_V1, extensionId: VSCODE_EXTENSION_ID, version: '2.11.0',
    buildIdentity: HASH_A, inputs: { 'extensions/vscode-model-bindings/package.json': HASH_A }, toolIdentities: { typescript: '5.9.3' }
  });
  assert.throws(() => validateCompanionSourceReceipt({ ...receipt, buildIdentity: HASH_B }, { releaseImmutableIdentity: HASH_A }), { code: 'BUILD_IDENTITY_IMMUTABLE_VIOLATION' });
  assert.throws(() => validateCompanionSourceReceipt({ ...receipt, inputs: { './bad/path.ts': HASH_A } }), { code: 'PATH_UNSAFE' });
  assert.equal(verifyCompanionLayoutContract({
    mode: 'development-checkout', descriptor, sourceReceipt: receipt, actualVsixSha256: HASH_B, manifestVsixSha256: HASH_B,
    liveInputDigests: { 'extensions/vscode-model-bindings/package.json': HASH_A }
  }).checkoutFreshnessVerified, true);
  assert.equal(verifyCompanionLayoutContract({
    mode: 'packed-package', descriptor, sourceReceipt: receipt, actualVsixSha256: HASH_B, manifestVsixSha256: HASH_B
  }).checkoutFreshnessVerified, false);
  assert.throws(() => verifyCompanionLayoutContract({
    mode: 'development-checkout', descriptor, sourceReceipt: receipt, actualVsixSha256: HASH_B, manifestVsixSha256: HASH_B, liveInputDigests: {}
  }), { code: 'MISSING_CHECKOUT_INPUT' });
  assert.throws(() => validateCompanionCliOptions({
    commandKind: 'publish', commandAction: 'apply', targets: ['vscode'], installVscodeCompanion: true, noInstallVscodeCompanion: true
  }), { code: 'USAGE_INVALID' });
  assert.throws(() => validateCompanionCliOptions({ commandKind: 'recover', targets: ['vscode'], installVscodeCompanion: true }), { code: 'USAGE_INVALID' });
  assert.equal(validateCompanionCliOptions({
    commandKind: 'publish', commandAction: 'apply', targets: ['vscode'], installVscodeCompanion: true,
    vscodeEditor: '/usr/bin/code', vscodeProfile: 'IsolatedTest', env: { SSH_CONNECTION: '10.0.0.1 1234 10.0.0.2 22' }
  }).remoteContextUnsupported, true);
  const failedNotice = validateCompanionInstallNotice({
    schema: VSCODE_COMPANION_INSTALL_SCHEMA_V1, publication: 'committed', status: 'manual-setup-required', requested: true, exitCode: 5,
    extensionId: VSCODE_EXTENSION_ID, version: '2.11.0', buildIdentity: HASH_A, editor: '/usr/bin/code', profile: 'IsolatedTest',
    reason: 'Unsupported remote context', proposedApiFlag: VSCODE_PROPOSED_API_FLAG
  });
  assert.equal(failedNotice.exitCode, 5);
  assert.throws(() => validateCompanionInstallNotice({ ...failedNotice, exitCode: 0 }), { code: 'CONTRACT_INVALID' });
});

test('local URI allowlist, root precedence, cross-scope bindings, selector collision, and storage bounds', () => {
  assert.equal(validateLocalRootUri('file:///home/user/my%20dir/.evcrate-vscode/').rootIdentity, 'file:///home/user/my dir/.evcrate-vscode');
  assert.equal(validateLocalRootUri({ scheme: 'file', path: '/home/user/my dir/.evcrate-vscode' }).rootIdentity, 'file:///home/user/my dir/.evcrate-vscode');
  assert.throws(() => validateLocalRootUri('vscode-remote://ssh-remote+box/work/.evcrate-vscode'), { code: 'UNSUPPORTED_REMOTE_AUTHORITY' });
  assert.throws(() => validateLocalRootUri('wsl://Ubuntu/home/user/.evcrate-vscode'), { code: 'UNSUPPORTED_REMOTE_AUTHORITY' });
  assert.throws(() => validateLocalRootUri('file:///home/user/%2e%2e/etc/passwd'), { code: 'PATH_UNSAFE' });

  const validHome = { uri: 'file:///home/user/.evcrate-vscode', present: true, valid: true, approved: true };
  const invalidProj = { uri: 'file:///work/.evcrate-vscode', present: true, valid: false, approved: true };
  assert.throws(() => resolveInstallationRoot({ workspaceTrusted: false, projectRoots: [], homeRoot: validHome }), { code: 'WORKSPACE_UNTRUSTED' });
  assert.throws(() => resolveInstallationRoot({ workspaceTrusted: true, projectRoots: [invalidProj], homeRoot: validHome }), { code: 'PROJECT_INSTALLATION_INVALID' });
  const validProjA = { uri: 'file:///work/a/.evcrate-vscode', present: true, valid: true, approved: true };
  const validProjB = { uri: 'file:///work/b/.evcrate-vscode', present: true, valid: true, approved: true };
  assert.throws(() => resolveInstallationRoot({ workspaceTrusted: true, projectRoots: [validProjA, validProjB] }), { code: 'MULTI_ROOT_SELECTION_REQUIRED' });
  assert.equal(resolveInstallationRoot({
    workspaceTrusted: true, projectRoots: [validProjA, validProjB], explicitSelectedRootIdentity: 'file:///work/b/.evcrate-vscode'
  }).rootIdentity, 'file:///work/b/.evcrate-vscode');

  const catalog = [
    { vendor: 'copilot', id: 'claude-opus-4', name: 'Claude Opus 4' },
    { vendor: 'copilot', id: 'claude-sonnet-4', name: 'Claude Sonnet 4' },
    { vendor: 'copilot', id: 'dup-1', name: 'Duplicate Model' },
    { vendor: 'copilot', id: 'dup-2', name: 'Duplicate Model' }
  ];
  assert.equal(formatCatalogSelector(catalog[0]), 'Claude Opus 4 (copilot)');
  assert.equal(resolveCatalogModelSelector(catalog, 'copilot', 'dup-1').code, 'SELECTOR_AMBIGUOUS');
  assert.equal(resolveCatalogModelSelector(catalog, 'copilot', 'missing-id').code, 'MODEL_NOT_FOUND');
  assert.throws(() => validateBindingsV1({ schema: VSCODE_BINDINGS_SCHEMA_V1, revision: 1, tiers: {}, actors: {} }, 70_000), { code: 'BOUNDS_EXCEEDED' });

  const userBindings = validateBindingsV1({
    schema: VSCODE_BINDINGS_SCHEMA_V1, revision: 1,
    tiers: { opus: { vendor: 'copilot', id: 'claude-opus-4' }, haiku: { vendor: 'copilot', id: 'claude-sonnet-4' } },
    actors: { 'evc-planner': { kind: 'model', vendor: 'copilot', id: 'claude-sonnet-4' } }
  });
  const rootBindings = validateBindingsV1({
    schema: VSCODE_BINDINGS_SCHEMA_V1, revision: 2,
    tiers: { opus: { vendor: 'copilot', id: 'claude-opus-4' } }, actors: { 'evc-scout': { kind: 'inherit' } }
  });
  const resolved = resolveEffectiveActorBinding({ actorId: 'evc-planner', canonicalTier: 'opus', rootBindings, userBindings, catalog });
  assert.equal(resolved.effectiveSource, 'user.actor');
  assert.equal(resolved.renderedSelector, 'Claude Sonnet 4 (copilot)');
  assert.equal(resolveEffectiveActorBinding({ actorId: 'evc-scout', canonicalTier: 'haiku', rootBindings, userBindings, catalog }).renderedSelector, null);
  assert.equal(resolveEffectiveActorBinding({ actorId: 'evc-scout', canonicalTier: 'haiku', rootBindings: null, userBindings, catalog }).effectiveSource, 'user.tier');
  assert.equal(resolveEffectiveActorBinding({ actorId: 'evc-debugger', canonicalTier: 'opus', rootBindings, userBindings, catalog }).effectiveSource, 'root.tier');
  assert.equal(resolveEffectiveActorBinding({ actorId: 'evc-debugger', canonicalTier: 'sonnet', rootBindings, userBindings, catalog }).reason, 'TIER_UNBOUND');
  assert.equal(resolveEffectiveActorBinding({ actorId: 'evc-ui-ux-designer', canonicalTier: null, rootBindings, userBindings, catalog }).effectiveSource, 'canonical.inherit');
  assert.equal(buildGenerationStoragePath(HASH_A, UUID_1, 3), `resolved/${HASH_A}/${UUID_1}/gen-3`);
  assert.throws(() => evaluateStorageBudget({ activeInstanceGenerations: Number.NaN, activeInstanceBytes: -1, persistentAuthorityBytes: 0, newGenerationBytes: 512 }), { code: 'CONTRACT_INVALID' });
  assert.equal(evaluateStorageBudget({ activeInstanceGenerations: STORAGE_AND_SOURCE_BOUNDS.maxActiveInstanceGenerations, activeInstanceBytes: 1024, persistentAuthorityBytes: 1024, newGenerationBytes: 512 }).code, 'STORAGE_BUDGET_EXCEEDED');
  assert.equal(canReclaimGeneration({ ownerInstanceUuid: UUID_1, currentInstanceUuid: UUID_2, isActiveTurnGeneration: false, automaticReclamationProven: true, allEditorWindowsClosed: false, referencingSessionsRetired: false }), false);
  const diagInput = {
    schema: VSCODE_RUNTIME_DIAGNOSTICS_SCHEMA_V1, rootIdentity: 'file:///work/.evcrate-vscode',
    authority: 'local-file', instanceUuid: UUID_1, bindingRevision: 2, catalogRevision: 1,
    templateInventorySha256: HASH_A, cachedSelectionNotice: 'Reselect agent or reload window after binding change.',
    actors: { 'evc-planner': { ...resolved, hostObservedModel: null } }
  };
  const validatedDiag = validateRuntimeDiagnosticsV1(diagInput);
  assert.equal(validatedDiag.schema, VSCODE_RUNTIME_DIAGNOSTICS_SCHEMA_V1);
  assert.notEqual(validatedDiag, diagInput);
});
