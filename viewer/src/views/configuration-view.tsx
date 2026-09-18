import type { FC } from 'react';
import type { AppState } from '../app-state.js';
import { formatRatioPercent } from '../components/metric-ratio.js';
import type { AdvisorPolicyV2 } from '../../../src/protocol/advisor-contract-runtime.js';

export interface ConfigurationViewProps {
  readonly state: AppState;
}

export const ConfigurationView: FC<ConfigurationViewProps> = ({ state }) => {
  const { policyResult, snapshot } = state;
  const policy = policyResult?.policy as AdvisorPolicyV2 | undefined;
  const routeGroups = snapshot?.metricsResult?.metrics?.route_groups ?? [];

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
          <h3 className="card-subtitle">Current Active Policy</h3>
          {!policyResult ? (
            <div className="policy-empty text-muted">
              <p>No policy file loaded. Click "Choose Policy File" to inspect your local policy.</p>
            </div>
          ) : policyResult.status !== 'POLICY_READY' && policyResult.status !== 'POLICY_MIGRATION_REQUIRED' ? (
            <div className="policy-error text-danger">
              <p><strong>Policy inspection status:</strong> <code>{policyResult.status}</code></p>
            </div>
          ) : (
            <div className="policy-details">
              <div className="policy-meta">
                <span className="badge badge-info">Version {policy?.version ?? 1}</span>
                {policyResult.migrationRequired && (
                  <span className="badge badge-warning">Migration Required (v1 legacy)</span>
                )}
                {policyResult.fileName && <span className="text-muted">File: {policyResult.fileName}</span>}
              </div>

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
          <div className="card-disclaimer text-muted">
            <em>Observational only:</em> Current policy configuration is displayed for comparison and never rewrites or relabels historical records.
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
                        <div className="text-submuted">Effort: {rg.route.effort}</div>
                      </td>
                      <td>
                        <div className="id-sub">Prompt: <code>{rg.prompt_identity.slice(0, 10)}…</code></div>
                        <div className="id-sub">Build: <code>{rg.build_identity.slice(0, 10)}…</code></div>
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
          <div className="card-disclaimer text-muted">
            <em>Observational only:</em> Differences in delivery or latency reflect historical observational samples, not controlled experiments.
          </div>
        </div>
      </div>
    </section>
  );
};
