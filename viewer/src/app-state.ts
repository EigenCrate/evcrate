/**
 * @file app-state.ts
 * Central state definitions, reducer, and selectors for EVCrate Advisor Metrics Explorer & DamHopper Plugin.
 */

export type {
  ViewerStatus,
  DetailStatus,
  ActivityScope,
  BoundSourceStatus,
  BoundPolicyState,
  BoundEvaluationsState,
  BoundComparisonState,
  UiHistoryFilters,
  HistoryDetailState,
  EvaluationDetailState,
  AppState
} from './app-state-types.ts';

export {
  INITIAL_FILTERS,
  INITIAL_DETAIL_STATE,
  INITIAL_EVALUATION_DETAIL_STATE,
  INITIAL_BOUND_POLICY_STATE,
  INITIAL_BOUND_EVALUATIONS_STATE,
  INITIAL_BOUND_COMPARISON_STATE,
  INITIAL_STATE
} from './app-state-types.ts';

export type { AppAction } from './app-actions.ts';

export { appReducer } from './app-state-reducer.ts';

export {
  selectHistoryQuery,
  type HistoryQueryResult,
  selectFilteredRecords,
  selectSelectedRecord,
  selectSelectedRow,
  extractDomainFilters,
  extractDomainQuery,
  formatProjectName,
  formatRatioPercent
} from './app-state-selectors.ts';
