export type HashView = 'overview' | 'history' | 'configuration' | 'evaluations';

export const VALID_HASH_VIEWS: readonly HashView[] = Object.freeze([
  'overview',
  'history',
  'configuration',
  'evaluations'
]);

export function parseHashView(hashString: string | null | undefined): HashView {
  if (!hashString) return 'overview';
  const cleaned = hashString.startsWith('#') ? hashString.slice(1) : hashString;
  const normalized = cleaned.trim().toLowerCase();
  for (const v of VALID_HASH_VIEWS) {
    if (v === normalized) return v;
  }
  return 'overview';
}

export function formatHash(view: HashView): string {
  return `#${view}`;
}

export function getCurrentHashView(): HashView {
  if (typeof window === 'undefined' || typeof window.location === 'undefined') {
    return 'overview';
  }
  return parseHashView(window.location.hash);
}

export function setWindowHash(view: HashView): void {
  if (typeof window === 'undefined' || typeof window.location === 'undefined') {
    return;
  }
  window.location.hash = formatHash(view);
}
