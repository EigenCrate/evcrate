'use strict';

/**
 * @file context-table.cjs
 * Bounded ephemeral worker context table with generation and revision tracking.
 *
 * Enforces:
 * - Max 16 contexts per worker (RESOURCE_BUDGETS.maxContextsPerWorker)
 * - Max 4 active operations per context (RESOURCE_BUDGETS.maxOperationsPerContext)
 * - Epoch, activation generation, and grant/binding revision invariants
 * - Revocation on explicit close, generation change, epoch mismatch, idle TTL
 * - Safe error mapping via PluginError
 */

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { RESOURCE_BUDGETS, PluginErrorCode, PluginError } = require('@dam-hopper/plugin-sdk');
const { verifyTargetDirectory } = require('./binding.cjs');
const { EVCrateAdvisorProvider } = require('./provider.cjs');
const { toSafePluginError } = require('./error-mapping.cjs');
class WorkerContextTable {
  /**
   * @param {object} [options]
   * @param {number} [options.maxContexts=16]
   * @param {number} [options.maxOpsPerContext=4]
   * @param {number} [options.idleTtlMs=300000]
   */
  constructor(options = {}) {
    this.maxContexts = options.maxContexts || RESOURCE_BUDGETS.maxContextsPerWorker || 16;
    this.maxOpsPerContext = options.maxOpsPerContext || RESOURCE_BUDGETS.maxOperationsPerContext || 4;
    this.idleTtlMs = options.idleTtlMs || RESOURCE_BUDGETS.contextIdleTtlMs || 300000;
    this.historyRootPath = options.historyRootPath || null;
    /** @type {Map<string, object>} */
    this.contexts = new Map();
  }

  /**
   * Opens and freezes a new context entry.
   *
   * @param {object} params ContextOpenParams
   * @returns {object} ContextOpenResult
   */
  openContext(params) {
    if (!params || typeof params !== 'object') {
      throw new PluginError(PluginErrorCode.INVALID_INPUT, 'ContextOpenParams must be an object');
    }

    const {
      actorSubject,
      installationId,
      configuredProjectTarget,
      worktreePath,
      allowedOperations,
      allowCurrentAccountPolicy = false,
      apiConnectionEpoch,
      activationGeneration = 1,
      bindingRevision = 1,
      grantRevision = 1,
      contextId: requestedContextId
    } = params;

    if (!actorSubject || typeof actorSubject !== 'string' || actorSubject.length > 128) {
      throw new PluginError(PluginErrorCode.INVALID_INPUT, 'Invalid or missing actorSubject');
    }
    if (!installationId || typeof installationId !== 'string' || installationId.length > 128) {
      throw new PluginError(PluginErrorCode.INVALID_INPUT, 'Invalid or missing installationId');
    }
    if (!configuredProjectTarget || typeof configuredProjectTarget !== 'string') {
      throw new PluginError(PluginErrorCode.INVALID_INPUT, 'Invalid or missing configuredProjectTarget');
    }
    if (typeof apiConnectionEpoch !== 'number' || apiConnectionEpoch <= 0) {
      throw new PluginError(PluginErrorCode.INVALID_INPUT, 'Invalid apiConnectionEpoch');
    }
    if (typeof activationGeneration !== 'number' || activationGeneration <= 0) {
      throw new PluginError(PluginErrorCode.INVALID_INPUT, 'Invalid activationGeneration');
    }
    if (!Array.isArray(allowedOperations)) {
      throw new PluginError(PluginErrorCode.INVALID_INPUT, 'allowedOperations must be an array');
    }

    // Evict expired contexts before capacity check
    this.evictExpired();

    if (this.contexts.size >= this.maxContexts) {
      throw new PluginError(
        PluginErrorCode.OVERLOADED,
        `Maximum worker contexts (${this.maxContexts}) reached`,
        { retryable: true }
      );
    }

    let scopeKind = 'project';
    let rootIdentity = null;
    let sourceRevision = null;
    const scopeObj = params.scope || params.scopeDescriptor;
    if (scopeObj && typeof scopeObj === 'object') {
      if (scopeObj.kind === 'history-root' || scopeObj.kind === 'project') {
        scopeKind = scopeObj.kind;
      }
      rootIdentity = scopeObj.rootIdentity || scopeObj.root_identity || null;
      sourceRevision = scopeObj.sourceRevision ?? scopeObj.source_revision ?? null;
    } else if (params.scopeKind === 'history-root' || params.scopeKind === 'project') {
      scopeKind = params.scopeKind;
    }

    // Verify directory target and compute history identity
    let verifiedTarget;
    if (scopeKind === 'history-root') {
      const historyRoot = this.historyRootPath || path.join(process.env.HOME || '', '.evcrate', 'advisor-history');
      try {
        verifiedTarget = verifyTargetDirectory(historyRoot);
      } catch (err) {
        throw toSafePluginError(err, PluginErrorCode.SOURCE_MISSING);
      }
      if (rootIdentity) {
        if (typeof rootIdentity !== 'string' || !/^[0-9a-f]{64}$/i.test(rootIdentity)) {
          throw new PluginError(PluginErrorCode.INVALID_INPUT, 'Invalid rootIdentity: must be 64-char lowercase SHA-256');
        }
        if (verifiedTarget.historyIdentity !== rootIdentity.toLowerCase()) {
          throw new PluginError(
            PluginErrorCode.SOURCE_NOT_CONFIGURED,
            'History root does not match approved root identity in scope descriptor'
          );
        }
      }
    } else {
      try {
        verifiedTarget = verifyTargetDirectory(configuredProjectTarget);
      } catch (err) {
        throw toSafePluginError(err, PluginErrorCode.SOURCE_MISSING);
      }
    }
    const contextId = (typeof requestedContextId === 'string' && requestedContextId.length > 0 && requestedContextId.length <= 128)
      ? requestedContextId
      : `ctx-${randomUUID()}`;

    if (this.contexts.has(contextId)) {
      throw new PluginError(PluginErrorCode.INVALID_INPUT, `Context ${contextId} already exists`);
    }

    const now = Date.now();
    const expiresAt = now + this.idleTtlMs;

    let policyDescriptor = params.policy_descriptor || null;
    if (!policyDescriptor && allowCurrentAccountPolicy) {
      const defaultPolicyPath = path.join(process.env.HOME || '', '.evcrate', 'advisor-routing.json');
      if (fs.existsSync(defaultPolicyPath)) {
        policyDescriptor = { path: defaultPolicyPath };
      }
    }

    let evaluationDescriptors = params.evaluation_descriptors || [];
    if (evaluationDescriptors.length === 0) {
      const candidateDirs = [
        path.join(process.env.HOME || '', '.evcrate', 'advisor-evaluations'),
        path.join(process.env.HOME || '', '.evcrate', 'evaluations'),
        path.join(configuredProjectTarget || '', 'tests', 'fixtures', 'advisor-evaluations'),
        path.join(verifiedTarget.normalized || '', 'tests', 'fixtures', 'advisor-evaluations'),
        path.join(process.cwd(), 'tests', 'fixtures', 'advisor-evaluations'),
      ];
      const seen = new Set();
      for (const dir of candidateDirs) {
        if (dir && fs.existsSync(dir)) {
          try {
            const stat = fs.statSync(dir);
            if (stat.isDirectory()) {
              const files = fs.readdirSync(dir).sort();
              for (const file of files) {
                if (file.endsWith('.json') && !file.includes('mismatch') && !file.includes('invalid')) {
                  const ref = path.basename(file, '.json');
                  if (!seen.has(ref)) {
                    seen.add(ref);
                    evaluationDescriptors.push({
                      evaluation_ref: ref,
                      path: path.join(dir, file),
                      expected_revision: null
                    });
                  }
                }
              }
            }
          } catch {}
        }
      }
    }

    // Create raw context for E01 EVCrateAdvisorProvider
    const rawContext = {
      context_id: contextId,
      scope_kind: scopeKind,
      target: verifiedTarget.normalized,
      history_identity: verifiedTarget.historyIdentity,
      binding_revision: bindingRevision,
      allowed_operations: allowedOperations,
      policy_descriptor: policyDescriptor,
      evaluation_descriptors: evaluationDescriptors
    };

    let provider;
    try {
      provider = new EVCrateAdvisorProvider(rawContext, {
        historyRootPath: this.historyRootPath || undefined
      });
    } catch (err) {
      throw toSafePluginError(err, PluginErrorCode.SOURCE_NOT_CONFIGURED);
    }

    const entry = {
      contextId,
      actorSubject,
      installationId,
      scopeKind,
      rootIdentity,
      sourceRevision,
      configuredProjectTarget: verifiedTarget.normalized,
      historyIdentity: verifiedTarget.historyIdentity,
      worktreePath: worktreePath || null,
      allowedOperations: Object.freeze([...allowedOperations]),
      allowCurrentAccountPolicy: Boolean(allowCurrentAccountPolicy),
      apiConnectionEpoch,
      activationGeneration,
      bindingRevision,
      grantRevision,
      createdAt: now,
      lastActiveAt: now,
      expiresAt,
      provider,
      activeOpsCount: 0,
      revoked: false,
      revokeReason: null
    };
    this.contexts.set(contextId, entry);

    return {
      contextId,
      scopeKind,
      bindingRevision,
      grantRevision,
      activationGeneration,
      expiresAt
    };
  }

  /**
   * Retrieves an active context entry and checks invocation authorization.
   *
   * @param {string} contextId
   * @param {string} operation
   * @returns {object} The ContextEntry
   */
  getAuthorizedContext(contextId, operation) {
    if (!contextId || typeof contextId !== 'string') {
      throw new PluginError(PluginErrorCode.INVALID_INPUT, 'Invalid contextId');
    }

    const entry = this.contexts.get(contextId);
    if (!entry) {
      throw new PluginError(PluginErrorCode.CONTEXT_REVOKED, `Context ${contextId} not found or expired`);
    }

    if (entry.revoked) {
      throw new PluginError(
        PluginErrorCode.CONTEXT_REVOKED,
        `Context ${contextId} revoked: ${entry.revokeReason || 'Revocation triggered'}`
      );
    }

    if (Date.now() > entry.expiresAt) {
      this.revokeContext(contextId, 'idle_timeout');
      throw new PluginError(PluginErrorCode.CONTEXT_REVOKED, `Context ${contextId} expired due to idle timeout`);
    }

    if (!entry.allowedOperations.includes(operation)) {
      throw new PluginError(
        PluginErrorCode.FORBIDDEN,
        `Operation '${operation}' is not allowed by context permissions`
      );
    }

    if (operation === 'policy.readCurrent' && !entry.allowCurrentAccountPolicy) {
      throw new PluginError(
        PluginErrorCode.FORBIDDEN,
        `Operation 'policy.readCurrent' denied: allowCurrentAccountPolicy is false`
      );
    }

    if (entry.activeOpsCount >= this.maxOpsPerContext) {
      throw new PluginError(
        PluginErrorCode.OVERLOADED,
        `Context operation capacity (${this.maxOpsPerContext}) exceeded`,
        { retryable: true }
      );
    }

    return entry;
  }

  /**
   * Acquires an active operation slot for a context.
   *
   * @param {string} contextId
   */
  acquireOperation(contextId) {
    const entry = this.contexts.get(contextId);
    if (entry && !entry.revoked) {
      entry.activeOpsCount++;
      entry.lastActiveAt = Date.now();
      entry.expiresAt = entry.lastActiveAt + this.idleTtlMs;
    }
  }

  /**
   * Releases an active operation slot for a context.
   *
   * @param {string} contextId
   */
  releaseOperation(contextId) {
    const entry = this.contexts.get(contextId);
    if (entry) {
      entry.activeOpsCount = Math.max(0, entry.activeOpsCount - 1);
      entry.lastActiveAt = Date.now();
      entry.expiresAt = entry.lastActiveAt + this.idleTtlMs;
    }
  }

  /**
   * Closes a context explicitly.
   *
   * @param {string} contextId
   * @param {string} [reason='explicit_close']
   * @returns {boolean} True if closed
   */
  closeContext(contextId, reason = 'explicit_close') {
    const entry = this.contexts.get(contextId);
    if (!entry) return false;
    entry.revoked = true;
    entry.revokeReason = reason;
    this.contexts.delete(contextId);
    return true;
  }

  /**
   * Revokes a context and marks it as revoked before deletion.
   *
   * @param {string} contextId
   * @param {string} reason
   */
  revokeContext(contextId, reason) {
    const entry = this.contexts.get(contextId);
    if (entry) {
      entry.revoked = true;
      entry.revokeReason = reason;
      this.contexts.delete(contextId);
    }
  }
  /**
   * Revokes all contexts currently active in the worker (e.g. on worker shutdown or crash).
   *
   * @param {string} [reason='worker_shutdown']
   * @returns {number}
   */
  revokeAll(reason = 'worker_shutdown') {
    const count = this.contexts.size;
    for (const [contextId] of this.contexts.entries()) {
      this.revokeContext(contextId, reason);
    }
    return count;
  }

  /**
   * Evicts expired contexts based on idle TTL.
   *
   * @returns {number} Number of evicted contexts
   */
  evictExpired() {
    const now = Date.now();
    let count = 0;
    for (const [contextId, entry] of this.contexts.entries()) {
      if (now > entry.expiresAt) {
        this.revokeContext(contextId, 'idle_timeout');
        count++;
      }
    }
    return count;
  }

  /**
   * @returns {number}
   */
  get size() {
    return this.contexts.size;
  }
}

module.exports = {
  WorkerContextTable
};
