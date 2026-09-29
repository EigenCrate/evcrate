import type { FC } from 'react';
import type { AppState } from '../app-state.js';
import { formatRatioPercent } from '../components/metric-ratio.js';
import { RouteGroupCard } from '../components/route-group-card.js';
import { PolicySummaryCard } from '../components/policy-summary-card.js';
import type { HistoryRouteGroupMetricV1 } from '../../../src/protocol/advisor-metrics.js';

export interface ConfigurationViewProps {
  readonly state: AppState;
}

export const ConfigurationView: FC<ConfigurationViewProps> = ({ state }) => {
  const { snapshot, historySummary, activityScope } = state;
  const routeGroups: readonly HistoryRouteGroupMetricV1[] =
    snapshot?.metricsResult?.metrics?.route_groups ??
    historySummary?.metrics?.metrics?.route_groups ??
    [];

  return (
    <section
      className="view-panel configuration-view"
      id="panel-configuration"
      role="tabpanel"
      aria-labelledby="tab-configuration"
      tabIndex={0}
    >
      <div className="view-header">
        <h2 className="view-title">Configuration & Route Comparisons</h2>
        <p className="text-muted">
          Compare active owner routing policy alongside historical route and build groupings.
        </p>
      </div>

      <div className="config-grid">
        {/* Compact Policy Summary Card */}
        <PolicySummaryCard state={state} />

        {/* Independent Historical Route Groups Section */}
        <div className="config-card routes-section-card">
          <div className="routes-header">
            <div className="routes-title-group">
              <h3 className="card-subtitle">
                Historical Route Groups <span className="badge badge-secondary">{routeGroups.length}</span>
              </h3>
              <span className="badge badge-info history-scope-badge">
                Scope: {activityScope === 'all' ? 'All History' : 'Workspace Project'}
              </span>
            </div>
          </div>

          {routeGroups.length === 0 ? (
            <div className="historical-routes-empty alert alert-info">
              <p><strong>No historical route metrics loaded.</strong></p>
              <p className="text-muted">
                Historical route metrics reflect recorded consultations in the selected history scope ({activityScope === 'all' ? 'All History' : 'Workspace Project'}). Try refreshing history or select an active project in Workspace.
              </p>
            </div>
          ) : (
            <div className="routes-content">
              {/* Responsive route cards for narrow viewports and container widths down to 180px */}
              <div className="routes-cards-list" aria-label="Historical route group cards">
                {routeGroups.map((rg, idx) => (
                  <RouteGroupCard
                    key={`${rg.route.backend}-${rg.route.model}-${rg.prompt_identity}-${rg.build_identity}-${idx}`}
                    routeGroup={rg}
                    index={idx}
                  />
                ))}
              </div>

              {/* Table representation for wide viewports */}
              <div className="routes-table-wrapper">
                <table className="routes-table" aria-label="Historical route metrics table">
                  <thead>
                    <tr>
                      <th scope="col">Route</th>
                      <th scope="col">Identities</th>
                      <th scope="col">Count</th>
                      <th scope="col">Delivery</th>
                      <th scope="col">Resolution</th>
                      <th scope="col">p50 / p95</th>
                    </tr>
                  </thead>
                  <tbody>
                    {routeGroups.map((rg, idx) => (
                      <tr key={`${rg.route.backend}-${rg.route.model}-${rg.prompt_identity}-${rg.build_identity}-${idx}`}>
                        <td>
                          <strong>{rg.route.backend}</strong>/{rg.route.model}
                          <div className="text-submuted">{rg.route.effort}</div>
                        </td>
                        <td>
                          <div className="identity-tags">
                            <code title={rg.prompt_identity}>p:{rg.prompt_identity.slice(0, 8)}…</code>
                            <code title={rg.build_identity}>b:{rg.build_identity.slice(0, 8)}…</code>
                          </div>
                        </td>
                        <td>{rg.counts.consultations}</td>
                        <td>{formatRatioPercent(rg.delivery.value)}</td>
                        <td>{formatRatioPercent(rg.known_outcome_resolution.value)}</td>
                        <td>
                          {rg.latency.p50 !== null ? `${Math.round(rg.latency.p50)} ms` : '—'}
                          <div className="text-submuted">
                            p95: {rg.latency.p95 !== null ? `${Math.round(rg.latency.p95)} ms` : '—'}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
