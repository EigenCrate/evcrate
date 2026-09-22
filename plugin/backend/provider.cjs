'use strict';

/**
 * @file provider.cjs
 * Operation coordinator and binding checker for EVCrate Advisor Provider (Phase E01).
 *
 * Implements context-bound dispatch for all 8 v1 domain operations:
 * history.refresh, history.summary, history.page, history.detail,
 * policy.readCurrent, evaluations.list, evaluations.read, evaluations.compare.
 * Re-runs E00 path normalization/identity checks, validates inputs/outputs against schema.
 */

const { verifyWorkerContext, verifyTargetDirectory } = require('./binding.cjs');
const { SnapshotStore } = require('./snapshot-store.cjs');
const { HistoryProvider } = require('./history-provider.cjs');
const { PolicyProvider } = require('./policy-provider.cjs');
const { EvaluationProvider } = require('./evaluation-provider.cjs');
const { forbidden, invalidInput } = require('./provider-errors.cjs');
const dataApi = require('./data-api.cjs');
const {
  validateHistoryRefreshParams,
  validateHistoryRefreshResult,
  validateHistorySummaryParams,
  validateHistorySummaryResult,
  validateHistoryPageParams,
  validateHistoryPageResult,
  validateHistoryDetailParams,
  validateHistoryDetailResult,
  validatePolicyReadCurrentParams,
  validatePolicyReadCurrentResult,
  validateEvaluationsListParams,
  validateEvaluationsListResult,
  validateEvaluationsReadParams,
  validateEvaluationsReadResult,
  validateEvaluationsCompareParams,
  validateEvaluationsCompareResult,
  ADVISOR_DATA_METHODS
} = dataApi;

class EVCrateAdvisorProvider {
  /**
   * @param {object} rawContext Trusted worker context from runner/SDK
   * @param {object} [options]
   * @param {SnapshotStore} [options.snapshotStore]
   * @param {string} [options.historyRootPath]
   */
  constructor(rawContext, options = {}) {
    this.context = verifyWorkerContext(rawContext);
    this.snapshotStore = options.snapshotStore || new SnapshotStore();
    this.historyProvider = new HistoryProvider(this.snapshotStore, options.historyRootPath);
    this.policyProvider = new PolicyProvider();
    this.evaluationProvider = new EvaluationProvider();
  }

  getContext() {
    return this.context;
  }

  getSnapshotStore() {
    return this.snapshotStore;
  }

  async invoke(method, params = {}, options = {}) {
    if (!ADVISOR_DATA_METHODS.includes(method)) {
      throw invalidInput(`Unknown domain method: ${method}`);
    }
    if (!this.context.allowedOperations.includes(method)) {
      throw forbidden(`Operation '${method}' is not permitted by worker context`);
    }

    // Re-verify target directory invariants on each invocation
    verifyTargetDirectory(this.context.target);

    const { signal, deadline } = options;

    switch (method) {
      case 'history.refresh': {
        const validatedParams = validateHistoryRefreshParams(params);
        const rawResult = await this.historyProvider.refresh(this.context, { signal, deadline });
        return validateHistoryRefreshResult(rawResult);
      }
      case 'history.summary': {
        const validatedParams = validateHistorySummaryParams(params);
        const rawResult = this.historyProvider.summary(this.context, validatedParams);
        return validateHistorySummaryResult(rawResult);
      }
      case 'history.page': {
        const validatedParams = validateHistoryPageParams(params);
        const rawResult = this.historyProvider.page(this.context, validatedParams);
        return validateHistoryPageResult(rawResult);
      }
      case 'history.detail': {
        const validatedParams = validateHistoryDetailParams(params);
        const rawResult = this.historyProvider.detail(this.context, validatedParams);
        return validateHistoryDetailResult(rawResult);
      }
      case 'policy.readCurrent': {
        validatePolicyReadCurrentParams(params);
        const rawResult = this.policyProvider.readCurrentPolicy(this.context);
        return validatePolicyReadCurrentResult(rawResult);
      }
      case 'evaluations.list': {
        const validatedParams = validateEvaluationsListParams(params);
        const rawResult = this.evaluationProvider.list(this.context, validatedParams);
        return validateEvaluationsListResult(rawResult);
      }
      case 'evaluations.read': {
        const validatedParams = validateEvaluationsReadParams(params);
        const rawResult = this.evaluationProvider.read(this.context, validatedParams);
        return validateEvaluationsReadResult(rawResult);
      }
      case 'evaluations.compare': {
        const validatedParams = validateEvaluationsCompareParams(params);
        const rawResult = this.evaluationProvider.compare(this.context, validatedParams);
        return validateEvaluationsCompareResult(rawResult);
      }
      default:
        throw invalidInput(`Unhandled method: ${method}`);
    }
  }
}

module.exports = {
  EVCrateAdvisorProvider
};
