import type { FC } from 'react';
import type { ComparableEvaluationGroup } from '../../../src/protocol/advisor-evaluation-comparison.js';
import { EvaluationGroupCard } from './evaluation-group-card.js';
import { EvaluationDetail } from '../views/evaluation-detail.js';

export interface ComparableGroupsSectionProps {
  readonly groups: readonly ComparableEvaluationGroup[];
  readonly selectedGroupKey: string | null;
  readonly revealCandidates: boolean;
  readonly onSelectGroup: (groupKey: string | null) => void;
}

/**
 * ComparableGroupsSection: Grid of comparable evaluation group cards
 * and integrated EvaluationDetail drawer when a group is selected.
 */
export const ComparableGroupsSection: FC<ComparableGroupsSectionProps> = ({
  groups,
  selectedGroupKey,
  revealCandidates,
  onSelectGroup
}) => {
  const selectedGroup = groups.find((g) => g.key === selectedGroupKey) ?? null;

  return (
    <div className="evaluations-groups-section">
      <h3 className="section-subtitle">
        Comparable Groups <span className="badge badge-secondary">{groups.length}</span>
      </h3>

      {groups.length === 0 ? (
        <div className="eval-empty-groups alert alert-info">
          <p><strong>No comparable evaluation groups formed yet.</strong></p>
          <p className="text-muted">
            Click &ldquo;Compare Available Descriptors&rdquo; above to aggregate available documents into comparable groups by matching rubric and input digests.
          </p>
        </div>
      ) : (
        <div className="evaluations-layout">
          <div className="eval-groups-grid" aria-label="Comparable evaluation groups">
            {groups.map((g) => (
              <EvaluationGroupCard
                key={g.key}
                group={g}
                isSelected={g.key === selectedGroupKey}
                onToggleSelect={() => onSelectGroup(g.key === selectedGroupKey ? null : g.key)}
              />
            ))}
          </div>

          {selectedGroup && (
            <EvaluationDetail
              group={selectedGroup}
              revealCandidates={revealCandidates}
              onClose={() => onSelectGroup(null)}
            />
          )}
        </div>
      )}
    </div>
  );
};
