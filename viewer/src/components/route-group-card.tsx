import type { FC } from 'react';
import { formatRatioPercent } from './metric-ratio.js';
import type { HistoryRouteGroupMetricV1 } from '../../../src/protocol/advisor-metrics.js';

export interface RouteGroupCardProps {
  readonly routeGroup: HistoryRouteGroupMetricV1;
  readonly index: number;
}

/**
 * RouteGroupCard: Compact, responsive card representing a historical route and build group.
 * Designed with a strict zero-horizontal-overflow guarantee down to 180px viewports.
 */
export const RouteGroupCard: FC<RouteGroupCardProps> = ({ routeGroup: rg, index }) => {
  return (
    <div className="route-card">
      <div className="route-card-header">
        <div className="route-title-line">
          <strong className="route-name">
            {rg.route.backend}/{rg.route.model}
          </strong>
          <span className="badge badge-secondary">{rg.route.effort}</span>
        </div>
        <span className="badge badge-info">{rg.counts.consultations} runs</span>
      </div>

      <div className="route-card-body">
        <div className="card-field">
          <span className="field-label">Identities:</span>
          <div className="identity-tags">
            <code className="id-code" title={`Prompt: ${rg.prompt_identity}`}>
              p:{rg.prompt_identity.slice(0, 8)}…
            </code>
            <code className="id-code" title={`Build: ${rg.build_identity}`}>
              b:{rg.build_identity.slice(0, 8)}…
            </code>
          </div>
        </div>

        <div className="card-field">
          <span className="field-label">Delivery:</span>
          <div className="field-value">
            <strong className="metric-rate">{formatRatioPercent(rg.delivery.value)}</strong>{' '}
            <span className="text-muted">({rg.delivery.numerator}/{rg.delivery.denominator})</span>
          </div>
        </div>

        <div className="card-field">
          <span className="field-label">Resolution:</span>
          <div className="field-value">
            <strong className="metric-rate">
              {formatRatioPercent(rg.known_outcome_resolution.value)}
            </strong>{' '}
            <span className="text-muted">
              ({rg.known_outcome_resolution.numerator}/{rg.known_outcome_resolution.denominator})
            </span>
          </div>
        </div>

        <div className="card-field">
          <span className="field-label">Latency:</span>
          <div className="field-value">
            p50: <strong>{rg.latency.p50 !== null ? `${Math.round(rg.latency.p50)} ms` : '—'}</strong>
            {' '}&bull;{' '}
            p95: <strong>{rg.latency.p95 !== null ? `${Math.round(rg.latency.p95)} ms` : '—'}</strong>
          </div>
        </div>
      </div>
    </div>
  );
};
