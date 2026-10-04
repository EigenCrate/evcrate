export const VSCODE_LOCAL_MODEL_MAP: Readonly<Record<string, string>> = Object.freeze({
  opus: 'claude-3-opus',
  sonnet: 'claude-3.5-sonnet',
  haiku: 'claude-3.5-haiku'
});

export type LocalModelResolution =
  | { readonly mode: 'inherit'; readonly nativeModel: null }
  | { readonly mode: 'pin'; readonly nativeModel: string }
  | { readonly mode: 'unavailable'; readonly reason: string; readonly code: 'LOCAL_MODEL_UNAVAILABLE' };

export function resolveLocalModel(
  sourceModel: unknown,
  qualifiedModelMap: Record<string, string> = VSCODE_LOCAL_MODEL_MAP
): LocalModelResolution {
  if (sourceModel === undefined || sourceModel === null || sourceModel === '') {
    return Object.freeze({ mode: 'inherit', nativeModel: null });
  }
  if (typeof sourceModel !== 'string') {
    return Object.freeze({
      mode: 'unavailable',
      reason: 'Model identifier must be a string',
      code: 'LOCAL_MODEL_UNAVAILABLE'
    });
  }
  const trimmed = sourceModel.trim();
  if (trimmed === '' || trimmed === 'inherit') {
    return Object.freeze({ mode: 'inherit', nativeModel: null });
  }
  const mapped = qualifiedModelMap[trimmed.toLowerCase()];
  if (mapped) {
    return Object.freeze({ mode: 'pin', nativeModel: mapped });
  }
  return Object.freeze({
    mode: 'unavailable',
    reason: `Model "${sourceModel}" is unknown or unavailable in VS Code Local`,
    code: 'LOCAL_MODEL_UNAVAILABLE'
  });
}

export function buildVscodeModelMap(): Record<string, unknown> {
  return {
    schema: 'evcrate-vscode-model-map-v1',
    mappings: {
      opus: {
        source: 'opus',
        nativeModel: 'claude-3-opus',
        disposition: 'pinned',
        reason: 'High-tier reasoning mentor mapped to Claude 3 Opus'
      },
      sonnet: {
        source: 'sonnet',
        nativeModel: 'claude-3.5-sonnet',
        disposition: 'pinned',
        reason: 'Standard coding agent mapped to Claude 3.5 Sonnet'
      },
      haiku: {
        source: 'haiku',
        nativeModel: 'claude-3.5-haiku',
        disposition: 'pinned',
        reason: 'Fast utility agent mapped to Claude 3.5 Haiku'
      },
      inherit: {
        source: 'inherit',
        nativeModel: null,
        disposition: 'inherit',
        reason: 'Explicit inheritance from session active model'
      }
    },
    unsupported: {
      skillModelPins: 'VS Code Local Agent Plugins 1.0 skills do not support per-skill model frontmatter; model pins on skills are unsupported source semantics.'
    }
  };
}
