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
  validateHistoryRefreshParamsV2,
  validateHistoryRefreshResultV2,
  validateHistorySummaryParamsV2,
  validateHistorySummaryResultV2,
  validateHistoryPageParamsV2,
  validateHistoryPageResultV2,
  validateHistoryDetailParamsV2,
  validateHistoryDetailResultV2,
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

    const isRootScope = this.context.scopeKind === 'history-root';

    switch (method) {
      case 'history.refresh': {
        if (isRootScope) {
          const validatedParams = validateHistoryRefreshParamsV2(params);
          const rawResult = await this.historyProvider.refresh(this.context, { signal, deadline });
          return validateHistoryRefreshResultV2(rawResult);
        }
        const validatedParams = validateHistoryRefreshParams(params);
        const rawResult = await this.historyProvider.refresh(this.context, { signal, deadline });
        const { inventory, ...v1Result } = rawResult;
        return validateHistoryRefreshResult(v1Result);
      }
      case 'history.summary': {
        const isV2 = isRootScope || Boolean(params.query && 'project_id' in params.query);
        if (isV2) {
          const validatedParams = validateHistorySummaryParamsV2(params);
          const rawResult = this.historyProvider.summary(this.context, validatedParams);
          return validateHistorySummaryResultV2(rawResult);
        }
        const validatedParams = validateHistorySummaryParams(params);
        const rawResult = this.historyProvider.summary(this.context, validatedParams);
        const { inventory, ...v1Result } = rawResult;
        return validateHistorySummaryResult(v1Result);
      }
      case 'history.page': {
        const isV2 = isRootScope || Boolean(params.query && 'project_id' in params.query);
        if (isV2) {
          const validatedParams = validateHistoryPageParamsV2(params);
          const rawResult = this.historyProvider.page(this.context, validatedParams);
          return validateHistoryPageResultV2(rawResult);
        }
        const validatedParams = validateHistoryPageParams(params);
        const rawResult = this.historyProvider.page(this.context, validatedParams);
        return validateHistoryPageResult(rawResult);
      }
      case 'history.detail': {
        if (isRootScope) {
          const validatedParams = validateHistoryDetailParamsV2(params);
          const rawResult = this.historyProvider.detail(this.context, validatedParams);
          return validateHistoryDetailResultV2(rawResult);
        }
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
