import type {
  VscodeSettingDispositionEntry,
  VscodeSettingsDisposition
} from './configuration-types.js';
import { CANONICAL_SETTINGS_DISPOSITION_RULES } from './configuration-types.js';

export function classifySourceSettings(
  sourceSettings: Record<string, unknown> = {},
  sourcePath = 'settings.json'
): VscodeSettingsDisposition {
  const result: Record<string, VscodeSettingDispositionEntry> = {};

  // Inspect all keys from sourceSettings and ensure settings.local.json is classified
  const allKeys = Object.keys(sourceSettings);
  if (!allKeys.includes('settings.local.json')) {
    allKeys.push('settings.local.json');
  }

  for (const key of allKeys) {
    const rule = CANONICAL_SETTINGS_DISPOSITION_RULES[key];
    if (rule) {
      result[key] = Object.freeze({
        key,
        disposition: rule.disposition,
        reason: rule.reason,
        nativeEquivalent: rule.nativeEquivalent
      });
    } else {
      result[key] = Object.freeze({
        key,
        disposition: 'unsupported',
        reason: `Unknown canonical setting key "${key}" is not mapped to VS Code Local.`,
        nativeEquivalent: null
      });
    }
  }

  return Object.freeze({
    schema: 'evcrate-vscode-settings-disposition-v1',
    source: sourcePath,
    keys: Object.freeze(result)
  });
}
