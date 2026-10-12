import { createHash } from 'node:crypto';
import type * as vscode from 'vscode';
import {
  CompanionContractError,
  validateLocalRootUri
} from './runtime-contracts.js';
import {
  VSCODE_BINDINGS_SCHEMA_V1,
  validateBindingsV1,
  type CanonicalModelTier,
  type VscodeModelBindingsV1
} from './binding-contracts.js';

const USER_BINDINGS_KEY = 'evcrate.userBindings.v1';
const ROOT_BINDINGS_PREFIX = 'evcrate.rootBindings.v1:';

function getRootStorageKey(rootIdentity: string): string {
  const validated = validateLocalRootUri(rootIdentity);
  const hash = createHash('sha256').update(validated.rootIdentity, 'utf8').digest('hex').slice(0, 16);
  return `${ROOT_BINDINGS_PREFIX}${hash}`;
}

export type StoredBindingResult =
  | { readonly ok: true; readonly bindings: VscodeModelBindingsV1 | null }
  | { readonly ok: false; readonly error: CompanionContractError; readonly raw: unknown };

export function parseStoredBindings(raw: unknown): StoredBindingResult {
  if (raw === undefined || raw === null) {
    return Object.freeze({ ok: true, bindings: null });
  }
  try {
    const validated = validateBindingsV1(raw);
    return Object.freeze({ ok: true, bindings: validated });
  } catch (err) {
    const error = err instanceof CompanionContractError
      ? err
      : new CompanionContractError('CONTRACT_INVALID', `Failed to parse stored bindings: ${String(err)}`);
    return Object.freeze({ ok: false, error, raw });
  }
}

export function createEmptyBindings(revision = 1): VscodeModelBindingsV1 {
  return Object.freeze({
    schema: VSCODE_BINDINGS_SCHEMA_V1,
    revision,
    tiers: Object.freeze({}),
    actors: Object.freeze({})
  });
}

export class ScopedBindingStore {
  constructor(
    private readonly globalState: vscode.Memento,
    private readonly workspaceState: vscode.Memento,
    private readonly remoteAuthority?: string
  ) {
    if (typeof remoteAuthority === 'string' && remoteAuthority.trim() !== '') {
      throw new CompanionContractError(
        'UNSUPPORTED_REMOTE_AUTHORITY',
        `Unsupported remote authority "${remoteAuthority}"; only local file:// roots are supported`
      );
    }
  }

  getUserBindings(): StoredBindingResult {
    const raw = this.globalState.get<unknown>(USER_BINDINGS_KEY);
    return parseStoredBindings(raw);
  }

  getRootBindings(rootIdentity: string): StoredBindingResult {
    const key = getRootStorageKey(rootIdentity);
    const raw = this.workspaceState.get<unknown>(key);
    return parseStoredBindings(raw);
  }

  async saveUserBindings(
    bindings: VscodeModelBindingsV1,
    expectedRevision?: number
  ): Promise<VscodeModelBindingsV1> {
    const current = this.getUserBindings();
    if (!current.ok) {
      throw current.error;
    }
    const curRev = current.bindings?.revision ?? 0;
    if (expectedRevision !== undefined && curRev !== expectedRevision) {
      throw new CompanionContractError(
        'CONTRACT_INVALID',
        `Revision conflict in user bindings: expected ${expectedRevision}, found ${curRev}`
      );
    }
    const nextRevision = Math.max(curRev + 1, bindings.revision);
    const validated = validateBindingsV1({ ...bindings, revision: nextRevision });
    await this.globalState.update(USER_BINDINGS_KEY, validated);
    return validated;
  }

  async saveRootBindings(
    rootIdentity: string,
    bindings: VscodeModelBindingsV1,
    expectedRevision?: number
  ): Promise<VscodeModelBindingsV1> {
    const key = getRootStorageKey(rootIdentity);
    const current = this.getRootBindings(rootIdentity);
    if (!current.ok) {
      throw current.error;
    }
    const curRev = current.bindings?.revision ?? 0;
    if (expectedRevision !== undefined && curRev !== expectedRevision) {
      throw new CompanionContractError(
        'CONTRACT_INVALID',
        `Revision conflict in root bindings: expected ${expectedRevision}, found ${curRev}`
      );
    }
    const nextRevision = Math.max(curRev + 1, bindings.revision);
    const validated = validateBindingsV1({ ...bindings, revision: nextRevision });
    await this.workspaceState.update(key, validated);
    return validated;
  }

  async clearUserBindings(target?: { tier?: CanonicalModelTier; actor?: string }): Promise<boolean> {
    if (!target) {
      const had = this.globalState.get(USER_BINDINGS_KEY) !== undefined;
      await this.globalState.update(USER_BINDINGS_KEY, undefined);
      return had;
    }
    const current = this.getUserBindings();
    if (!current.ok) throw current.error;
    if (!current.bindings) return false;
    const tiers = { ...current.bindings.tiers };
    const actors = { ...current.bindings.actors };
    let changed = false;
    if (target.tier && target.tier in tiers) {
      delete tiers[target.tier];
      changed = true;
    }
    if (target.actor && target.actor in actors) {
      delete actors[target.actor];
      changed = true;
    }
    if (!changed) return false;
    const updated: VscodeModelBindingsV1 = {
      schema: VSCODE_BINDINGS_SCHEMA_V1,
      revision: current.bindings.revision + 1,
      tiers,
      actors
    };
    await this.saveUserBindings(updated);
    return true;
  }

  async clearRootBindings(
    rootIdentity: string,
    target?: { tier?: CanonicalModelTier; actor?: string }
  ): Promise<boolean> {
    const key = getRootStorageKey(rootIdentity);
    if (!target) {
      const had = this.workspaceState.get(key) !== undefined;
      await this.workspaceState.update(key, undefined);
      return had;
    }
    const current = this.getRootBindings(rootIdentity);
    if (!current.ok) throw current.error;
    if (!current.bindings) return false;
    const tiers = { ...current.bindings.tiers };
    const actors = { ...current.bindings.actors };
    let changed = false;
    if (target.tier && target.tier in tiers) {
      delete tiers[target.tier];
      changed = true;
    }
    if (target.actor && target.actor in actors) {
      delete actors[target.actor];
      changed = true;
    }
    if (!changed) return false;
    const updated: VscodeModelBindingsV1 = {
      schema: VSCODE_BINDINGS_SCHEMA_V1,
      revision: current.bindings.revision + 1,
      tiers,
      actors
    };
    await this.saveRootBindings(rootIdentity, updated);
    return true;
  }
}
