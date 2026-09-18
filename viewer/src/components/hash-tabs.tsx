import type { FC } from 'react';
import { VALID_HASH_VIEWS, formatHash, type HashView } from '../hash-view.js';

export interface HashTabsProps {
  readonly activeView: HashView;
  readonly onSelectView: (view: HashView) => void;
  readonly counts?: {
    readonly historyRecords?: number;
    readonly evaluationDocs?: number;
  };
}

const TAB_LABELS: Record<HashView, string> = {
  overview: 'Overview',
  history: 'History Records',
  configuration: 'Configuration',
  evaluations: 'Evaluations'
};

export const HashTabs: FC<HashTabsProps> = ({
  activeView,
  onSelectView,
  counts
}) => {
  return (
    <nav className="hash-tabs-nav" aria-label="Explorer views">
      <ul className="hash-tabs-list" role="tablist">
        {VALID_HASH_VIEWS.map((view) => {
          const isActive = view === activeView;
          const label = TAB_LABELS[view];
          let badge: number | null = null;
          if (view === 'history' && counts?.historyRecords !== undefined) {
            badge = counts.historyRecords;
          } else if (view === 'evaluations' && counts?.evaluationDocs !== undefined) {
            badge = counts.evaluationDocs;
          }

          return (
            <li key={view} className="hash-tab-item" role="presentation">
              <a
                href={formatHash(view)}
                role="tab"
                id={`tab-${view}`}
                aria-selected={isActive}
                aria-controls={`panel-${view}`}
                aria-current={isActive ? 'page' : undefined}
                className={`hash-tab-link ${isActive ? 'active' : ''}`}
                onClick={(e: { preventDefault: () => void }) => {
                  e.preventDefault();
                  onSelectView(view);
                  window.location.hash = formatHash(view);
                }}
              >
                <span className="tab-label">{label}</span>
                {badge !== null && <span className="tab-badge">{badge}</span>}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};
