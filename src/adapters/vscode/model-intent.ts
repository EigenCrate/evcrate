import { ContractValidationError, SHA256_HEX, assertExactKeys, isSafePlainRecord } from './companion-package-contracts.js';
export type CanonicalModelTier = 'opus' | 'sonnet' | 'haiku';
export const VSCODE_CANONICAL_TIERS: Record<CanonicalModelTier, true> = Object.freeze({ opus: true, sonnet: true, haiku: true });

export const VSCODE_AGENT_INTENT_SCHEMA_V1 = 'evcrate-vscode-agent-intent-v1' as const;
export const VSCODE_AGENT_TOOL_AUDIT_SCHEMA_V2 = 'evcrate-vscode-agent-tool-audit-v2' as const;
export const MAX_ACTORS_PER_ROOT = 512;
export const MAX_TEMPLATE_BYTES = 1_048_576;

export type CanonicalModelIntent = { readonly mode: 'inherit'; readonly tier: null } | { readonly mode: 'tier'; readonly tier: CanonicalModelTier };
export interface VscodeAgentIntentRecord {
  readonly actorId: string;
  readonly sourcePath: string;
  readonly templatePath: string;
  readonly templateSha256: string;
  readonly referenceBase: 'agents';
  readonly intent: CanonicalModelIntent;
  readonly tools: { readonly mapped: readonly string[]; readonly dropped: readonly string[]; readonly explicitNone: boolean };
  readonly delegation: { readonly allowed: boolean; readonly agents: readonly string[] };
  readonly visibility: { readonly userInvocable: boolean; readonly disableModelInvocation: boolean };
}

export interface VscodeAgentIntentManifestV1 {
  readonly schema: typeof VSCODE_AGENT_INTENT_SCHEMA_V1; readonly pluginName: 'evc'; readonly actors: Readonly<Record<string, VscodeAgentIntentRecord>>;
}

export interface VscodeAgentAuditEntryV2 {
  readonly source: string;
  readonly target: string;
  readonly templateSha256: string;
  readonly modelIntent: { readonly source?: string; readonly tier: CanonicalModelTier | null; readonly disposition: 'tier-required' | 'inherit' };
  readonly tools: { readonly mapped: readonly string[]; readonly dropped: readonly string[]; readonly explicitNone: boolean };
  readonly delegation: { readonly allowed: boolean; readonly agents: readonly string[] };
}

export interface VscodeAgentToolAuditV2 {
  readonly schema: typeof VSCODE_AGENT_TOOL_AUDIT_SCHEMA_V2; readonly agents: Readonly<Record<string, VscodeAgentAuditEntryV2>>;
}

export const ACTOR_ID_PATTERN = /^evc-[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const SOURCE_AGENT_PATH = /^\.claude\/agents\/(evc-[a-z0-9]+(?:-[a-z0-9]+)*)\.md$/u;
const TEMPLATE_AGENT_PATH = /^evcrate\/agent-templates\/(evc-[a-z0-9]+(?:-[a-z0-9]+)*)\.md$/u;
export function resolveCanonicalModelIntent(sourceModel: unknown): CanonicalModelIntent {
  if (sourceModel === undefined || sourceModel === null || sourceModel === '') {
    return Object.freeze({ mode: 'inherit', tier: null });
  }
  if (typeof sourceModel !== 'string') {
    throw new ContractValidationError('CONTRACT_INVALID', 'Canonical model identifier must be a string');
  }
  const trimmed = sourceModel.trim();
  if (trimmed === '' || trimmed === 'inherit') return Object.freeze({ mode: 'inherit', tier: null });
  if (Object.hasOwn(VSCODE_CANONICAL_TIERS, trimmed)) {
    return Object.freeze({ mode: 'tier', tier: trimmed as CanonicalModelTier });
  }
  throw new ContractValidationError('CONTRACT_INVALID', `Unsupported or concrete canonical model "${sourceModel}"`);
}

function validateStringList(value: unknown, field: string): readonly string[] {
  if (
    !Array.isArray(value) || value.length > 128
    || !value.every((item) => typeof item === 'string' && item.trim() !== '' && item.length <= 256 && !/[\0\r\n]/u.test(item))
  ) {
    throw new ContractValidationError('CONTRACT_INVALID', `Invalid bounded string array for "${field}"`);
  }
  return Object.freeze([...value]);
}

function validateToolsAndDelegation(rawTools: unknown, rawDelegation: unknown, key: string): {
  readonly tools: VscodeAgentIntentRecord['tools']; readonly delegation: VscodeAgentIntentRecord['delegation'];
} {
  if (!isSafePlainRecord(rawTools) || typeof rawTools.explicitNone !== 'boolean') {
    throw new ContractValidationError('CONTRACT_INVALID', `Invalid tools metadata for "${key}"`);
  }
  assertExactKeys(rawTools, ['mapped', 'dropped', 'explicitNone'], `actor "${key}" tools`);
  if (!isSafePlainRecord(rawDelegation) || typeof rawDelegation.allowed !== 'boolean') {
    throw new ContractValidationError('CONTRACT_INVALID', `Invalid delegation metadata for "${key}"`);
  }
  assertExactKeys(rawDelegation, ['allowed', 'agents'], `actor "${key}" delegation`);
  return {
    tools: Object.freeze({
      mapped: validateStringList(rawTools.mapped, 'tools.mapped'),
      dropped: validateStringList(rawTools.dropped, 'tools.dropped'),
      explicitNone: rawTools.explicitNone
    }),
    delegation: Object.freeze({ allowed: rawDelegation.allowed, agents: validateStringList(rawDelegation.agents, 'delegation.agents') })
  };
}

export function validateAgentIntentManifest(input: unknown): VscodeAgentIntentManifestV1 {
  if (!isSafePlainRecord(input)) throw new ContractValidationError('CONTRACT_INVALID', 'Agent intent manifest must be an object');
  if (input.schema !== VSCODE_AGENT_INTENT_SCHEMA_V1) {
    throw new ContractValidationError('SCHEMA_UNSUPPORTED', `Unsupported agent intent schema: ${String(input.schema)}`);
  }
  assertExactKeys(input, ['schema', 'pluginName', 'actors'], 'agent intent manifest');
  if (input.pluginName !== 'evc' || !isSafePlainRecord(input.actors)) {
    throw new ContractValidationError('CONTRACT_INVALID', 'Invalid pluginName or actors map');
  }
  const keys = Object.keys(input.actors);
  if (keys.length === 0 || keys.length > MAX_ACTORS_PER_ROOT) {
    throw new ContractValidationError('BOUNDS_EXCEEDED', `Actor count ${keys.length} outside 1..${MAX_ACTORS_PER_ROOT}`);
  }
  const validatedActors: Record<string, VscodeAgentIntentRecord> = {};
  for (const [key, raw] of Object.entries(input.actors)) {
    if (key.length > 64 || !ACTOR_ID_PATTERN.test(key) || !isSafePlainRecord(raw)) {
      throw new ContractValidationError('CONTRACT_INVALID', `Invalid actor record "${key}"`);
    }
    assertExactKeys(raw, [
      'actorId', 'sourcePath', 'templatePath', 'templateSha256', 'referenceBase', 'intent', 'tools', 'delegation', 'visibility'
    ], `actor "${key}"`);
    if (raw.actorId !== key || raw.referenceBase !== 'agents') {
      throw new ContractValidationError('CONTRACT_INVALID', `Actor key or referenceBase mismatch for "${key}"`);
    }
    if (
      typeof raw.sourcePath !== 'string' || SOURCE_AGENT_PATH.exec(raw.sourcePath)?.[1] !== key
      || typeof raw.templatePath !== 'string' || TEMPLATE_AGENT_PATH.exec(raw.templatePath)?.[1] !== key
    ) {
      throw new ContractValidationError('PATH_UNSAFE', `Invalid sourcePath or templatePath for "${key}"`);
    }
    if (typeof raw.templateSha256 !== 'string' || !SHA256_HEX.test(raw.templateSha256)) {
      throw new ContractValidationError('HASH_MISMATCH', `Invalid templateSha256 for "${key}"`);
    }
    if (!isSafePlainRecord(raw.intent)) throw new ContractValidationError('CONTRACT_INVALID', `Invalid intent for "${key}"`);
    assertExactKeys(raw.intent, ['mode', 'tier'], `actor "${key}" intent`);
    const intent: CanonicalModelIntent = raw.intent.mode === 'inherit' && raw.intent.tier === null
      ? Object.freeze({ mode: 'inherit', tier: null })
      : raw.intent.mode === 'tier' && typeof raw.intent.tier === 'string' && Object.hasOwn(VSCODE_CANONICAL_TIERS, raw.intent.tier)
        ? Object.freeze({ mode: 'tier', tier: raw.intent.tier as CanonicalModelTier })
        : (() => { throw new ContractValidationError('CONTRACT_INVALID', `Malformed intent for "${key}"`); })();
    if (!isSafePlainRecord(raw.visibility) || typeof raw.visibility.userInvocable !== 'boolean' || typeof raw.visibility.disableModelInvocation !== 'boolean') {
      throw new ContractValidationError('CONTRACT_INVALID', `Invalid visibility metadata for "${key}"`);
    }
    assertExactKeys(raw.visibility, ['userInvocable', 'disableModelInvocation'], `actor "${key}" visibility`);
    const { tools, delegation } = validateToolsAndDelegation(raw.tools, raw.delegation, key);
    validatedActors[key] = Object.freeze({
      actorId: key, sourcePath: raw.sourcePath, templatePath: raw.templatePath, templateSha256: raw.templateSha256,
      referenceBase: 'agents', intent, tools, delegation,
      visibility: Object.freeze({
        userInvocable: raw.visibility.userInvocable, disableModelInvocation: raw.visibility.disableModelInvocation
      })
    });
  }
  return Object.freeze({ schema: VSCODE_AGENT_INTENT_SCHEMA_V1, pluginName: 'evc', actors: Object.freeze(validatedActors) });
}

export function validateAgentToolAuditV2(input: unknown): VscodeAgentToolAuditV2 {
  if (!isSafePlainRecord(input)) throw new ContractValidationError('CONTRACT_INVALID', 'Audit must be an object');
  if (input.schema !== VSCODE_AGENT_TOOL_AUDIT_SCHEMA_V2) {
    throw new ContractValidationError('SCHEMA_UNSUPPORTED', `Unsupported audit schema: ${String(input.schema)}`);
  }
  assertExactKeys(input, ['schema', 'agents'], 'agent tool audit v2');
  if (!isSafePlainRecord(input.agents) || Object.keys(input.agents).length === 0) {
    throw new ContractValidationError('CONTRACT_INVALID', 'Audit agents must be non-empty');
  }
  const validated: Record<string, VscodeAgentAuditEntryV2> = {};
  for (const [key, entry] of Object.entries(input.agents)) {
    if (key.length > 64 || !ACTOR_ID_PATTERN.test(key) || !isSafePlainRecord(entry)) {
      throw new ContractValidationError('CONTRACT_INVALID', `Invalid audit entry "${key}"`);
    }
    assertExactKeys(entry, ['source', 'target', 'templateSha256', 'modelIntent', 'tools', 'delegation'], `audit "${key}"`);
    if (
      typeof entry.source !== 'string' || SOURCE_AGENT_PATH.exec(entry.source)?.[1] !== key
      || typeof entry.target !== 'string' || TEMPLATE_AGENT_PATH.exec(entry.target)?.[1] !== key
    ) {
      throw new ContractValidationError('PATH_UNSAFE', `Invalid audit source/target for "${key}"`);
    }
    if (typeof entry.templateSha256 !== 'string' || !SHA256_HEX.test(entry.templateSha256)) {
      throw new ContractValidationError('HASH_MISMATCH', `Invalid audit templateSha256 for "${key}"`);
    }
    if (!isSafePlainRecord(entry.modelIntent)) {
      throw new ContractValidationError('CONTRACT_INVALID', `Invalid audit modelIntent for "${key}"`);
    }
    assertExactKeys(entry.modelIntent, ['source', 'tier', 'disposition'], `audit "${key}" modelIntent`);
    const mi = entry.modelIntent;
    if (mi.source !== undefined && (typeof mi.source !== 'string' || mi.source.trim() === '')) {
      throw new ContractValidationError('CONTRACT_INVALID', `Invalid audit modelIntent.source for "${key}"`);
    }
    const validIntent = (mi.disposition === 'inherit' && mi.tier === null)
      || (mi.disposition === 'tier-required' && typeof mi.tier === 'string' && Object.hasOwn(VSCODE_CANONICAL_TIERS, mi.tier));
    if (!validIntent) {
      throw new ContractValidationError('CONTRACT_INVALID', `Invalid audit modelIntent for "${key}"`);
    }
    const { tools, delegation } = validateToolsAndDelegation(entry.tools, entry.delegation, key);
    validated[key] = Object.freeze({
      source: entry.source, target: entry.target, templateSha256: entry.templateSha256,
      modelIntent: Object.freeze({
        ...(mi.source !== undefined ? { source: mi.source } : {}),
        tier: (mi.tier as CanonicalModelTier | null),
        disposition: mi.disposition as 'tier-required' | 'inherit'
      }),
      tools, delegation
    });
  }
  return Object.freeze({ schema: VSCODE_AGENT_TOOL_AUDIT_SCHEMA_V2, agents: Object.freeze(validated) });
}
