/**
 * @file app-state.ts
 * Central state definitions, reducer, and selectors for EVCrate Advisor Metrics Explorer & DamHopper Plugin.
 */

export type {
  ViewerStatus,
  DetailStatus,
  UiHistoryFilters,
  HistoryDetailState,
  EvaluationDetailState,
  AppState
} from './app-state-types.ts';

export {
  INITIAL_FILTERS,
  INITIAL_DETAIL_STATE,
  INITIAL_EVALUATION_DETAIL_STATE,
  INITIAL_STATE
} from './app-state-types.ts';

export type { AppAction } from './app-actions.ts';

export { appReducer } from './app-state-reducer.ts';

export {
  selectFilteredRecords,
  selectSelectedRecord,
  selectSelectedRow,
  extractDomainFilters,
  formatRatioPercent
} from './app-state-selectors.ts';
