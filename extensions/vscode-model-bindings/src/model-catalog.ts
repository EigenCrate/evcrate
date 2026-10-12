import * as vscode from 'vscode';
import {
  CompanionContractError,
  STORAGE_AND_SOURCE_BOUNDS,
  isPlainObject
} from './runtime-contracts.js';
import {
  formatCatalogSelector,
  type CatalogModelDescriptor
} from './binding-contracts.js';

export interface ValidatedCatalogModel extends CatalogModelDescriptor {
  readonly selector: string;
  readonly isAmbiguous: boolean;
  readonly ambiguousReason?: string;
}

export interface CatalogSnapshot {
  readonly revision: number;
  readonly models: readonly ValidatedCatalogModel[];
  readonly rawCount: number;
  readonly ambiguousCount: number;
  readonly invalidCount: number;
}

function compareModels(a: CatalogModelDescriptor, b: CatalogModelDescriptor): number {
  const vCmp = a.vendor.localeCompare(b.vendor, undefined, { sensitivity: 'base' });
  if (vCmp !== 0) return vCmp;
  const nCmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  if (nCmp !== 0) return nCmp;
  return a.id.localeCompare(b.id);
}

export function validateCatalogEntry(raw: unknown, index: number): CatalogModelDescriptor {
  if (!isPlainObject(raw)) {
    throw new CompanionContractError('CONTRACT_INVALID', `Catalog entry at index ${index} must be an object`);
  }
  const { vendor, id, name, family, version } = raw;
  if (typeof vendor !== 'string' || vendor.trim() === '' || vendor.length > 128) {
    throw new CompanionContractError('CONTRACT_INVALID', `Invalid vendor at catalog index ${index}`);
  }
  if (typeof id !== 'string' || id.trim() === '' || id.length > 256) {
    throw new CompanionContractError('CONTRACT_INVALID', `Invalid id at catalog index ${index}`);
  }
  if (typeof name !== 'string' || name.trim() === '' || name.length > 128) {
    throw new CompanionContractError('CONTRACT_INVALID', `Invalid name at catalog index ${index}`);
  }
  const cleanFamily = typeof family === 'string' && family.trim() !== '' ? family.trim() : undefined;
  const cleanVersion = typeof version === 'string' && version.trim() !== '' ? version.trim() : undefined;
  return Object.freeze({
    vendor: vendor.trim(),
    id: id.trim(),
    name: name.trim(),
    ...(cleanFamily ? { family: cleanFamily } : {}),
    ...(cleanVersion ? { version: cleanVersion } : {})
  });
}

export function buildCatalogSnapshot(
  rawList: readonly unknown[],
  revision = 1
): CatalogSnapshot {
  if (rawList.length > STORAGE_AND_SOURCE_BOUNDS.maxCatalogEntries) {
    throw new CompanionContractError(
      'BOUNDS_EXCEEDED',
      `Catalog entries count ${rawList.length} exceeds maximum ${STORAGE_AND_SOURCE_BOUNDS.maxCatalogEntries}`
    );
  }

  const validated: CatalogModelDescriptor[] = [];
  const seenExact = new Map<string, CatalogModelDescriptor>();

  let invalidCount = 0;
  for (let i = 0; i < rawList.length; i++) {
    let entry: CatalogModelDescriptor;
    try {
      entry = validateCatalogEntry(rawList[i], i);
    } catch {
      invalidCount++;
      continue;
    }
    const key = `${entry.vendor}:${entry.id}`;
    const existing = seenExact.get(key);
    if (existing) {
      if (existing.name !== entry.name || existing.family !== entry.family || existing.version !== entry.version) {
        invalidCount++;
        continue;
      }
      continue;
    }
    seenExact.set(key, entry);
    validated.push(entry);
  }

  const selectorToIds = new Map<string, Set<string>>();
  for (const m of validated) {
    const sel = formatCatalogSelector(m);
    let ids = selectorToIds.get(sel);
    if (!ids) {
      ids = new Set<string>();
      selectorToIds.set(sel, ids);
    }
    ids.add(m.id);
  }

  const sorted = [...validated].sort(compareModels);
  let ambiguousCount = 0;

  const models: ValidatedCatalogModel[] = sorted.map((m) => {
    const sel = formatCatalogSelector(m);
    const idSet = selectorToIds.get(sel);
    const isAmbiguous = (idSet?.size ?? 0) > 1;
    if (isAmbiguous) {
      ambiguousCount++;
      const idList = [...(idSet ?? [])].sort().join(', ');
      return Object.freeze({
        ...m,
        selector: sel,
        isAmbiguous: true,
        ambiguousReason: `Ambiguous selector "${sel}" across IDs [${idList}]`
      });
    }
    return Object.freeze({
      ...m,
      selector: sel,
      isAmbiguous: false
    });
  });

  return Object.freeze({
    revision,
    models: Object.freeze(models),
    rawCount: rawList.length,
    ambiguousCount,
    invalidCount
  });
}

export async function queryChatModelCatalog(
  lmApi: { selectChatModels(selector?: vscode.LanguageModelChatSelector): vscode.Thenable<vscode.LanguageModelChat[]> },
  revision = 1
): Promise<CatalogSnapshot> {
  const models = await lmApi.selectChatModels();
  return buildCatalogSnapshot(models, revision);
}
