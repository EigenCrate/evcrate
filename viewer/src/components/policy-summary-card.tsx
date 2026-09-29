import type { FC } from 'react';
import type { AdvisorPolicyV2 } from '../../../src/protocol/advisor-contract-runtime.js';
import type { AppState } from '../app-state.js';

export interface PolicySummaryCardProps {
  readonly state: AppState;
}

export const PolicySummaryCard: FC<PolicySummaryCardProps> = ({ state }) => {
  const { policyResult, currentPolicy, capabilities, policyState } = state;
  const policy = (currentPolicy?.policy ?? policyResult?.policy ?? policyState?.policy?.policy) as AdvisorPolicyV2 | undefined;

  const hasPolicyPerm = capabilities.length === 0 || capabilities.includes('policy.readCurrent');
  const policyStatus = policyState?.status && policyState.status !== 'ready' && policyState.status !== 'idle'
    ? policyState.status
    : currentPolicy?.status ?? policyResult?.status ?? 'not_configured';

  const revision = currentPolicy?.revision ?? policyState?.policy?.revision ?? (policyResult ? 'standalone' : 'none');
  const observedAt = currentPolicy?.observed_at ?? policyState?.policy?.observed_at;

  const statusBadge = (!hasPolicyPerm || policyStatus === 'forbidden')
    ? <span className="badge badge-danger">Forbidden</span>
    : policyStatus === 'missing'
    ? <span className="badge badge-danger">Missing</span>
    : (policyStatus === 'migration_required' || policyResult?.migrationRequired)
    ? <span className="badge badge-warning">Migration Required</span>
    : (policyStatus === 'ready' || policyResult?.status === 'POLICY_READY')
    ? <span className="badge badge-success">Ready</span>
    : policyStatus === 'not_configured'
    ? <span className="badge badge-secondary">Not Configured</span>
    : policyStatus === 'loading'
    ? <span className="badge badge-info">Loading...</span>
    : <span className="badge badge-danger">{String(policyStatus)}</span>;

  return (
    <div className="config-card policy-card">
      <div className="policy-card-header">
        <h3 className="card-subtitle">Active Owner Policy</h3>
        <div className="policy-badge-row">
          <span className="badge badge-info">Current owner policy — not filtered by History project</span>
          {statusBadge}
          <span className="badge badge-secondary">Revision: {revision}</span>
          {observedAt && (
            <span className="text-muted stat-sub">
              Observed: {new Date(observedAt).toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {!hasPolicyPerm || policyStatus === 'forbidden' ? (
        <div className="policy-state-banner alert alert-danger" role="alert">
          <strong>Forbidden:</strong> Policy inspection is not permitted under current actor grants.
        </div>
      ) : policyStatus === 'missing' ? (
        <div className="policy-state-banner alert alert-danger" role="alert">
          <strong>Missing Policy:</strong> Current routing policy document could not be located or was removed.
        </div>
      ) : policyStatus === 'not_configured' ? (
        <div className="policy-state-banner alert alert-info">
          <strong>Not Configured:</strong> No account-wide advisor routing policy is configured.
        </div>
      ) : policyStatus === 'migration_required' || policyResult?.migrationRequired ? (
        <div className="policy-state-banner alert alert-warning">
          <strong>Migration Required:</strong> Policy uses legacy v1 format. Update to v2 specification with primary and backup routes.
        </div>
      ) : policyStatus === 'loading' ? (
        <div className="policy-state-banner alert alert-info">
          <strong>Loading Policy:</strong> Loading active advisor routing policy…
        </div>
      ) : policyStatus !== 'ready' && policyResult?.status !== 'POLICY_READY' ? (
        <div className="policy-state-banner alert alert-danger">
          <strong>Policy inspection status:</strong> <code>{String(policyStatus)}</code>
          {policyState?.error && <div className="policy-error-msg">{policyState.error}</div>}
        </div>
      ) : (
        <div className="policy-content">
          {policy?.advisor && (
            <div className="policy-routes-summary">
              <div className="policy-route-item primary-route">
                <span className="route-role-badge badge badge-info">Primary</span>
                <div className="route-details">
                  <code className="route-target-code">
                    {policy.advisor.primary.backend} / {policy.advisor.primary.model}
                  </code>
                  <span className="text-submuted">({policy.advisor.primary.effort})</span>
                </div>
              </div>
              <div className="policy-route-item backup-route">
                <span className="route-role-badge badge badge-secondary">Backup</span>
                <div className="route-details">
                  <code className="route-target-code">
                    {policy.advisor.backup.backend} / {policy.advisor.backup.model}
                  </code>
                  <span className="text-submuted">({policy.advisor.backup.effort})</span>
                </div>
              </div>
            </div>
          )}

          {/* Collapsed full routing policy / migration details by default */}
          <details className="policy-disclosure">
            <summary className="policy-disclosure-summary">
              <span className="disclosure-label">View full routing policy & runtime parameters</span>
            </summary>
            <div className="policy-disclosure-content">
              <dl className="detail-dl policy-params-dl">
                <dt>Policy Version</dt>
                <dd><code>{policy?.version ?? 2}</code></dd>
                <dt>Primary Route</dt>
                <dd>
                  <code>{policy?.advisor?.primary.backend} / {policy?.advisor?.primary.model}</code> ({policy?.advisor?.primary.effort})
                </dd>
                <dt>Backup Route</dt>
                <dd>
                  <code>{policy?.advisor?.backup.backend} / {policy?.advisor?.backup.model}</code> ({policy?.advisor?.backup.effort})
                </dd>
                <dt>Wait Mode</dt>
                <dd><code>{policy?.wait?.mode ?? 'until_terminal'}</code></dd>
                <dt>Wait Warning</dt>
                <dd>Warn after {policy?.wait?.warn_after_ms ?? '—'} ms (repeat every {policy?.wait?.warn_every_ms ?? '—'} ms)</dd>
                <dt>History Policy</dt>
                <dd>Retention: {policy?.history?.retention_days ?? '—'} days &bull; Max: {policy?.history?.max_bytes ?? '—'} bytes</dd>
              </dl>

              <div className="policy-json-wrapper">
                <span className="json-label">Raw Policy JSON:</span>
                <pre className="policy-json-block">
                  <code>{JSON.stringify(policy, null, 2)}</code>
                </pre>
              </div>
            </div>
          </details>
        </div>
      )}

      <div className="card-disclaimer text-muted">
        <em>Observational notice:</em> This displays current account-wide owner policy only (not filtered by History project). It is not historical route evidence and does not represent past execution configurations.
      </div>
    </div>
  );
};
