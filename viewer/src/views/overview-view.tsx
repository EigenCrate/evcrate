import type { FC } from 'react';
import type { AppState } from '../app-state.js';
import { MetricRatio } from '../components/metric-ratio.js';
import { formatProjectName } from '../app-state.js';
import type { DistributionMetric, HistoryMetricResultV1 } from '../../../src/protocol/advisor-metrics.js';

export interface OverviewViewProps {
  readonly state: AppState;
}

function formatLatencyMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return 'Unavailable';
  return `${Math.round(ms)} ms`;
}

export const OverviewView: FC<OverviewViewProps> = ({ state }) => {
  const { snapshot, historySummary, status, staleReason } = state;
  const metricsResult: HistoryMetricResultV1 | null =
    snapshot?.metricsResult ?? historySummary?.metrics ?? null;

  if (!metricsResult) {
    return (
      <section className="view-panel overview-empty" id="panel-overview" aria-label="Overview">
        <div className="empty-state-card">
          <h3>No Advisor History Loaded</h3>
          <p>
            Please choose an advisor history source or click "Refresh History" above to inspect diagnostic metrics,
            outcome distributions, latency, and limitations.
          </p>
          <div className="empty-state-notice text-muted">
            All data is processed strictly within this client container.
          </div>
        </div>
      </section>
    );
  }

  const { counts, metrics, missingness, limitations, scope } = metricsResult;
  const lat: DistributionMetric = metrics.latency;

  return (
    <section className="view-panel overview-view" id="panel-overview" aria-label="Overview">
      <div className="overview-header">
        <h2 className="view-title">
          Overview Metrics
          {status === 'stale' && <span className="badge badge-warning" style={{ marginLeft: 8 }}>Stale Data</span>}
        </h2>
        <div className="overview-meta text-muted">
          <span>Scope: <strong>{scope.kind === 'history-root' ? (scope.selected_project_id ? 'Filtered Project' : 'All Projects') : scope.kind}</strong></span>
          {scope.selected_project_id && (
            <>
              <span className="meta-sep">&bull;</span>
              <span>Project: <strong>{formatProjectName(scope.selected_project_id, state.inventory?.entries.find((e) => e.project_id === scope.selected_project_id)?.label)}</strong></span>
            </>
          )}
          <span className="meta-sep">&bull;</span>
          <span>Projects: <strong>{counts.projects}</strong></span>
          <span className="meta-sep">&bull;</span>
          <span>Tasks: <strong>{counts.tasks}</strong></span>
          <span className="meta-sep">&bull;</span>
          <span>Consultations: <strong>{counts.consultations}</strong></span>
        </div>
      </div>
      {status === 'stale' && staleReason && (
        <div className="alert alert-warning" role="alert" style={{ marginBottom: 16 }}>
          <strong>Stale notice:</strong> {staleReason}
        </div>
      )}

      <div className="metrics-grid" aria-label="Key Rate Metrics">
        <MetricRatio label="Delivery Rate" metric={metrics.delivery} description="Delivered ADVICE_READY responses over total terminal consultations." />
        <MetricRatio label="Outcome Coverage" metric={metrics.outcome_coverage} description="Valid executor outcome reports recorded for consultations." />
        <MetricRatio label="Known Outcome Resolution" metric={metrics.known_outcome_resolution} description="Outcomes with resolved status among reported outcomes." />
        <MetricRatio label="Resolution Rate" metric={metrics.resolution} description="Known resolutions across all accepted consultations." />
        <MetricRatio label="Backup Model Use" metric={metrics.backup_use} description="Consultations where backup model was invoked." />
        <MetricRatio label="Retry Use" metric={metrics.retry_use} description="Consultations requiring two or more model execution attempts." />
      </div>

      <div className="overview-sections-grid">
        <div className="overview-card latency-card">
          <h3 className="section-subtitle">Receipt Latency</h3>
          <div className="latency-stats-grid">
            <div className="stat-item"><span className="stat-label">p50</span><strong className="stat-value">{formatLatencyMs(lat.p50)}</strong></div>
            <div className="stat-item"><span className="stat-label">p95</span><strong className="stat-value">{formatLatencyMs(lat.p95)}</strong></div>
            <div className="stat-item"><span className="stat-label">Mean</span><strong className="stat-value">{formatLatencyMs(lat.mean)}</strong></div>
            <div className="stat-item"><span className="stat-label">Min / Max</span><span className="stat-sub">{formatLatencyMs(lat.min)} / {formatLatencyMs(lat.max)}</span></div>
            <div className="stat-item"><span className="stat-label">Samples</span><span className="stat-sub">{lat.sample_count} ({lat.excluded} excluded)</span></div>
          </div>
        </div>

        <div className="overview-card counts-card">
          <h3 className="section-subtitle">Outcome & Missingness</h3>
          <div className="counts-breakdown">
            <div className="breakdown-row"><span>Resolved:</span><strong>{counts.outcome_results.resolved}</strong></div>
            <div className="breakdown-row"><span>Unresolved:</span><strong>{counts.outcome_results.unresolved}</strong></div>
            <div className="breakdown-row"><span>Regressed:</span><strong>{counts.outcome_results.regressed}</strong></div>
            <div className="breakdown-row"><span>Unknown / Missing:</span><span className="text-warning">{counts.outcome_results.unknown} / {missingness.missing_outcome}</span></div>
            <div className="breakdown-row"><span>Invalid records:</span><span className="text-danger">{missingness.invalid_execution + missingness.invalid_outcome}</span></div>
          </div>
        </div>

        <div className="overview-card limitations-card">
          <h3 className="section-subtitle">Methodological Limitations</h3>
          <ul className="limitations-list">
            {limitations.map((lim, idx) => (
              <li key={`${lim}-${idx}`} className="limitation-item">
                <code>{lim}</code>
              </li>
            ))}
          </ul>
          <p className="limitations-footnote text-muted">
            Observational only. This tool does not claim causal effectiveness, saved time, or cost evaluation.
          </p>
        </div>
      </div>
    </section>
  );
};
