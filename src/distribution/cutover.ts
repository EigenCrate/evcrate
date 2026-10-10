import { ControlPlaneError } from '../errors/control-plane-error.js';
import { PERSISTED_TARGETS, type PersistedTarget, normalizeTarget } from '../protocol/validation.js';

export type AuthoritativeEngine = 'python' | 'typescript';

export interface TargetGateReceipt {
  readonly target: PersistedTarget;
  readonly authoritativeEngine: AuthoritativeEngine;
  readonly parityVerified: boolean;
  readonly closureVerified: boolean;
  readonly schemaVersion: 2;
  readonly cutoverTimestamp: string;
  readonly notes: string;
}

export interface EngineSelectionOptions {
  readonly overrides?: Readonly<Partial<Record<PersistedTarget, AuthoritativeEngine>>>;
}

const DEFAULT_CUTOVER_RECEIPTS: Readonly<Record<PersistedTarget, TargetGateReceipt>> = Object.freeze({
  claude: Object.freeze({
    target: 'claude',
    authoritativeEngine: 'typescript',
    parityVerified: true,
    closureVerified: true,
    schemaVersion: 2,
    cutoverTimestamp: '2026-09-02T00:00:00.000Z',
    notes: 'Claude canonical target parity verified in Phase 5 and Phase 8; cutover complete.'
  }),
  antigravity: Object.freeze({
    target: 'antigravity',
    authoritativeEngine: 'typescript',
    parityVerified: true,
    closureVerified: true,
    schemaVersion: 2,
    cutoverTimestamp: '2026-09-02T00:00:00.000Z',
    notes: 'Antigravity target adapter parity verified in Phase 5; cutover complete.'
  }),
  codex: Object.freeze({
    target: 'codex',
    authoritativeEngine: 'typescript',
    parityVerified: true,
    closureVerified: true,
    schemaVersion: 2,
    cutoverTimestamp: '2026-09-02T00:00:00.000Z',
    notes: 'Codex target adapter and project docs parity verified in Phase 5; cutover complete.'
  }),
  pi: Object.freeze({
    target: 'pi',
    authoritativeEngine: 'typescript',
    parityVerified: true,
    closureVerified: true,
    schemaVersion: 2,
    cutoverTimestamp: '2026-09-02T00:00:00.000Z',
    notes: 'Pi target adapter, extensions, and settings parity verified in Phase 5 and Phase 8; cutover complete.'
  }),
  omp: Object.freeze({
    target: 'omp',
    authoritativeEngine: 'typescript',
    parityVerified: true,
    closureVerified: true,
    schemaVersion: 2,
    cutoverTimestamp: '2026-09-02T00:00:00.000Z',
    notes: 'OMP target adapter and promotion order 30 parity verified in Phase 5 and Phase 8; cutover complete.'
  }),
  copilot: Object.freeze({
    target: 'copilot',
    authoritativeEngine: 'typescript',
    parityVerified: true,
    closureVerified: true,
    schemaVersion: 2,
    cutoverTimestamp: '2026-09-02T00:00:00.000Z',
    notes: 'Copilot target adapter, JSONC merge, and promotion order 40 parity verified in Phase 5 and Phase 8; cutover complete.'
  }),
  vscode: Object.freeze({
    target: 'vscode',
    authoritativeEngine: 'typescript',
    parityVerified: false,
    closureVerified: false,
    schemaVersion: 2,
    cutoverTimestamp: '2026-10-02T00:00:00.000Z',
    notes: 'VS Code Local target pending qualification in Phases 02-08.'
  })
});

export function getTargetGateReceipt(target: PersistedTarget): TargetGateReceipt {
  const receipt = DEFAULT_CUTOVER_RECEIPTS[target];
  if (!receipt) throw new ControlPlaneError('CAPABILITY_UNSUPPORTED');
  return receipt;
}

export function getAllTargetGateReceipts(): readonly TargetGateReceipt[] {
  return PERSISTED_TARGETS.map((target) => getTargetGateReceipt(target));
}

export function authoritativeEngineForTarget(
  target: string,
  options: EngineSelectionOptions = {}
): AuthoritativeEngine {
  const normalized = normalizeTarget(target);
  if (options.overrides?.[normalized] !== undefined) {
    const override = options.overrides[normalized];
    if (override !== 'python' && override !== 'typescript') throw new ControlPlaneError('PROTOCOL_INVALID');
    if (override === 'python') throw new ControlPlaneError('CAPABILITY_UNSUPPORTED');
    return override;
  }
  return getTargetGateReceipt(normalized).authoritativeEngine;
}

/**
 * Validates that all requested targets share the same authoritative engine.
 * Mixed-engine atomic transactions must be rejected rather than split, forwarded, or partially published.
 */
export function assertUniformAuthoritativeEngine(
  targets: readonly string[],
  options: EngineSelectionOptions = {}
): AuthoritativeEngine {
  if (targets.length === 0) {
    return 'typescript';
  }
  const normalizedTargets = targets.map((t) => normalizeTarget(t));
  const engines = new Set<AuthoritativeEngine>(
    normalizedTargets.map((t) => authoritativeEngineForTarget(t, options))
  );

  if (engines.size > 1) {
    throw new ControlPlaneError('CAPABILITY_UNSUPPORTED');
  }

  const [engine] = engines;
  return engine ?? 'typescript';
}
