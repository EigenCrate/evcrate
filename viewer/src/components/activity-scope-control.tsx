import type { FC } from 'react';
import type { ActivityScope } from '../app-state-types.js';
import type { AdvisorWorkspaceContext } from '../providers/advisor-data-provider.js';
import { formatProjectName } from '../app-state-selectors.js';

export interface ActivityScopeControlProps {
  readonly scope: ActivityScope;
  readonly workspaceContext: AdvisorWorkspaceContext | null;
  readonly isAvailable: boolean;
  readonly onScopeChange: (scope: ActivityScope) => void;
}

export const ActivityScopeControl: FC<ActivityScopeControlProps> = ({
  scope,
  workspaceContext,
  isAvailable,
  onScopeChange
}) => {
  const project = workspaceContext?.project;
  const hasProject = Boolean(project && project.projectId);
  const rootAuthority = workspaceContext?.historyScope === 'history-root';
  const allAvailable = hasProject && rootAuthority && isAvailable;

  const projectLabel = hasProject
    ? formatProjectName(project!.projectId, project!.label)
    : 'No Project Selected';

  const allUnavailableReason = !hasProject
    ? 'Select a project in Workspace to load history'
    : !rootAuthority
      ? 'All History requires root history authority'
      : !isAvailable
        ? 'History provider is currently unavailable'
        : null;

  const noticeId = !hasProject
    ? 'scope-notice-no-project'
    : !rootAuthority
      ? 'scope-notice-no-root'
      : !isAvailable
        ? 'scope-notice-unavailable'
        : undefined;

  return (
    <div className="activity-scope-control" role="region" aria-label="Activity Scope">
      <div className="scope-button-group" role="group" aria-label="History activity scope">
        <button
          type="button"
          className={`btn btn-scope ${scope === 'workspace-project' ? 'active btn-primary' : 'btn-secondary'}`}
          disabled={!hasProject || !isAvailable}
          onClick={() => onScopeChange('workspace-project')}
          aria-pressed={scope === 'workspace-project'}
          aria-describedby={!hasProject || !isAvailable ? noticeId : undefined}
          title={hasProject ? `Scope to workspace project (${projectLabel})` : 'No workspace project selected'}
        >
          <span className="scope-title">Workspace Project</span>
          {hasProject && (
            <span className="scope-badge" title={projectLabel}>
              ({projectLabel})
            </span>
          )}
        </button>

        <button
          type="button"
          className={`btn btn-scope ${scope === 'all' ? 'active btn-primary' : 'btn-secondary'}`}
          disabled={!allAvailable}
          onClick={() => onScopeChange('all')}
          aria-pressed={scope === 'all'}
          aria-describedby={!allAvailable ? noticeId : undefined}
          title={allUnavailableReason ?? 'View all accessible consultation history across projects'}
        >
          <span className="scope-title">All History</span>
        </button>
      </div>

      {!hasProject && (
        <div id="scope-notice-no-project" className="scope-notice text-muted" aria-live="polite">
          Please select a project in Workspace to inspect advisor consultations.
        </div>
      )}

      {hasProject && !rootAuthority && scope === 'workspace-project' && (
        <div id="scope-notice-no-root" className="scope-notice text-muted" title={allUnavailableReason ?? undefined}>
          Scoped to selected workspace project. All History is unavailable for this session.
        </div>
      )}

      {hasProject && !isAvailable && (
        <div id="scope-notice-unavailable" className="scope-notice text-warning">
          History provider is currently unavailable.
        </div>
      )}
    </div>
  );
};
