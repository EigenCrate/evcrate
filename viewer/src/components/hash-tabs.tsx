import { useRef, useCallback, type FC, type KeyboardEvent } from 'react';
import { VALID_HASH_VIEWS, formatHash, getNextRovingHashView, type HashView } from '../hash-view.js';

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
  const tabRefs = useRef<Record<HashView, HTMLAnchorElement | null>>({
    overview: null,
    history: null,
    configuration: null,
    evaluations: null
  });

  const activateTab = useCallback(
    (view: HashView) => {
      onSelectView(view);
      if (typeof window !== 'undefined') {
        window.location.hash = formatHash(view);
      }
      const target = tabRefs.current[view];
      if (target) {
        target.focus();
        target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
      }
    },
    [onSelectView]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLAnchorElement>, currentView: HashView) => {
      const nextView = getNextRovingHashView(currentView, e.key);
      if (nextView !== null) {
        e.preventDefault();
        activateTab(nextView);
      }
    },
    [activateTab]
  );

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
                ref={(el: HTMLAnchorElement | null) => {
                  tabRefs.current[view] = el;
                }}
                href={formatHash(view)}
                role="tab"
                id={`tab-${view}`}
                tabIndex={isActive ? 0 : -1}
                aria-selected={isActive}
                aria-controls={`panel-${view}`}
                className={`hash-tab-link ${isActive ? 'active' : ''}`}
                onClick={(e: { preventDefault: () => void }) => {
                  e.preventDefault();
                  activateTab(view);
                }}
                onKeyDown={(e: KeyboardEvent<HTMLAnchorElement>) => handleKeyDown(e, view)}
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
