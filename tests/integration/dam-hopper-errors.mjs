const COUNSEL_FORBIDDEN_KEYS = Object.freeze([
  'checkpoint', 'question', 'evidence', 'prior_counsel', 'owner_disposition',
  'advice', 'recommendation', 'must_fix'
]);

export class DamHopperClientError extends Error {
  constructor(message, { code = 'CLIENT_ERROR', category = 'client', action = 'Check parameters and retry.', details = null } = {}) {
    super(message);
    this.name = 'DamHopperClientError';
    this.code = code;
    this.category = category;
    this.action = action;
    this.details = details;
  }
}

export class DamHopperConflictError extends DamHopperClientError {
  constructor(message, { conflict = null, details = null } = {}) {
    super(message, {
      code: 'CAS_CONFLICT',
      category: 'conflict',
      action: 'Refresh the current revision and preview again.',
      details: { conflict, ...details }
    });
    this.name = 'DamHopperConflictError';
    this.conflict = conflict;
    this.retryable = conflict?.retryable ?? true;
  }
}

export function detectCounselFields(data) {
  if (!data || typeof data !== 'object') return false;
  for (const key of Object.keys(data)) {
    if (COUNSEL_FORBIDDEN_KEYS.includes(key)) return true;
    if (typeof data[key] === 'object' && detectCounselFields(data[key])) return true;
  }
  return false;
}
