import type { FC } from 'react';
import type { AppState } from '../app-state.js';
import { formatRatioPercent } from '../components/metric-ratio.js';
import type { AdvisorPolicyV2 } from '../../../src/protocol/advisor-contract-runtime.js';
import type { HistoryRouteGroupMetricV1 } from '../../../src/protocol/advisor-metrics.js';

export interface ConfigurationViewProps {
  readonly state: AppState;
}

export const ConfigurationView: FC<ConfigurationViewProps> = ({ state }) => {
  const { policyResult, currentPolicy, snapshot, historySummary, capabilities } = state;
  const policy = (currentPolicy?.policy ?? policyResult?.policy) as AdvisorPolicyV2 | undefined;
  const routeGroups: readonly HistoryRouteGroupMetricV1[] =
    snapshot?.metricsResult?.metrics?.route_groups ??
    historySummary?.metrics?.metrics?.route_groups ??
    [];

  const hasPolicyPerm = capabilities.length === 0 || capabilities.includes('policy.readCurrent');
  const policyStatus = currentPolicy?.status ?? policyResult?.status ?? 'not_configured';
  const revision = currentPolicy?.revision ?? (policyResult ? 'standalone' : 'none');
  const observedAt = currentPolicy?.observed_at;

  return (
    <section className="view-panel configuration-view" id="panel-configuration" aria-label="Configuration">
      <div className="view-header">
        <h2 className="view-title">Configuration & Route Comparisons</h2>
        <p className="text-muted">
          Compare current active policy alongside historical route and build groupings.
        </p>
      </div>

      <div className="config-grid">
        <div className="config-card policy-card">
          <h3 className="card-subtitle">Current account-wide policy</h3>
          <div className="policy-badge-row" style={{ marginBottom: 12 }}>
            <span className="badge badge-info">Current account-wide policy</span>
            <span className="badge badge-secondary" style={{ marginLeft: 6 }}>Revision: {revision}</span>
            {observedAt && (
              <span className="text-muted" style={{ marginLeft: 8, fontSize: '0.85em' }}>
                Observed: {new Date(observedAt).toLocaleTimeString()}
              </span>
            )}
          </div>

          {!hasPolicyPerm ? (
            <div className="policy-error text-danger" role="alert">
              <p><strong>Forbidden:</strong> Policy inspection is not permitted under current actor grants.</p>
            </div>
          ) : policyStatus === 'not_configured' ? (
            <div className="policy-empty text-muted">
              <p>No account-wide advisor routing policy is configured.</p>
            </div>
          ) : policyStatus === 'migration_required' || policyResult?.migrationRequired ? (
            <div className="policy-warning text-warning">
              <p><strong>Migration Required:</strong> Policy uses legacy v1 format. Please migrate to v2.</p>
            </div>
          ) : policyStatus !== 'ready' && policyResult?.status !== 'POLICY_READY' ? (
            <div className="policy-error text-danger">
              <p><strong>Policy inspection status:</strong> <code>{policyStatus}</code></p>
            </div>
          ) : (
            <div className="policy-details">
              {policy?.advisor && (
                <div className="policy-routes-summary">
                  <div className="policy-route-item">
                    <strong>Primary Route:</strong>{' '}
                    <code>{policy.advisor.primary.backend} / {policy.advisor.primary.model} ({policy.advisor.primary.effort})</code>
                  </div>
                  <div className="policy-route-item">
                    <strong>Backup Route:</strong>{' '}
                    <code>{policy.advisor.backup.backend} / {policy.advisor.backup.model} ({policy.advisor.backup.effort})</code>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="card-disclaimer text-muted" style={{ marginTop: 16 }}>
            <em>Observational notice:</em> This displays the current account-wide policy configuration only. It is not historical route evidence and does not represent past execution configurations.
          </div>
        </div>

        <div className="config-card routes-table-card">
          <h3 className="card-subtitle">Historical Route Groups ({routeGroups.length})</h3>
          {routeGroups.length === 0 ? (
            <div className="text-muted">
              <p>No historical route metrics loaded.</p>
            </div>
          ) : (
            <div className="routes-table-wrapper">
              <table className="routes-table" aria-label="Historical route metrics">
                <thead>
                  <tr>
                    <th scope="col">Route</th>
                    <th scope="col">Identities</th>
                    <th scope="col">Count</th>
                    <th scope="col">Delivery</th>
                    <th scope="col">Resolution</th>
                    <th scope="col">p50 Latency</th>
                  </tr>
                </thead>
                <tbody>
                  {routeGroups.map((rg, idx) => (
                    <tr key={`${rg.route.backend}-${rg.route.model}-${idx}`}>
                      <td>
                        <strong>{rg.route.backend}</strong>/{rg.route.model}
                        <div className="text-submuted">{rg.route.effort}</div>
                      </td>
                      <td>
                        <div className="identity-tags">
                          <code>{rg.prompt_identity.slice(0, 8)}…</code>
                          <code>{rg.build_identity.slice(0, 8)}…</code>
                        </div>
                      </td>
                      <td>{rg.counts.consultations}</td>
                      <td>{formatRatioPercent(rg.delivery.value)}</td>
                      <td>{formatRatioPercent(rg.known_outcome_resolution.value)}</td>
                      <td>{rg.latency.p50 !== null ? `${Math.round(rg.latency.p50)} ms` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
