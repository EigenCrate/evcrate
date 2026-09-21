'use strict';

/**
 * @file policy-provider.cjs
 * Configured current account policy reader for EVCrate Advisor Provider (Phase E01).
 *
 * Enforces independent context capability check (policy.readCurrent),
 * 16 KiB owner-safe file read, strict schema inspection (ready/migration_required/unsupported/invalid/not_configured),
 * SHA-256 revision digest, and explicit scope: account, temporal: current labeling.
 */

const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { verifySafeRegularFile, isOwner } = require('./binding.cjs');
const { forbidden } = require('./provider-errors.cjs');
const { inspectPolicy, MAX_POLICY_BYTES } = require('../../.evcrate/source/.evcrate/bin/lib/advisor/policy-schema.cjs');

class PolicyProvider {
  readCurrentPolicy(context) {
    // 1. Context capability check
    if (!context.allowedOperations || !context.allowedOperations.includes('policy.readCurrent')) {
      throw forbidden("Operation 'policy.readCurrent' not permitted by current worker context");
    }

    const now = Date.now();
    const descriptor = context.policyDescriptor;

    // 2. Missing configuration -> not_configured
    if (!descriptor || !descriptor.path) {
      return Object.freeze({
        status: 'not_configured',
        scope: 'account',
        temporal: 'current',
        observed_at: now,
        revision: 'not_configured',
        policy: null,
        issue_code: null
      });
    }

    // 3. Inspect policy file safely with descriptor pinning
    let fd;
    let bytes;
    try {
      const initial = verifySafeRegularFile(descriptor.path, MAX_POLICY_BYTES);
      if (!initial) {
        return Object.freeze({
          status: 'not_configured',
          scope: 'account',
          temporal: 'current',
          observed_at: now,
          revision: 'missing',
          policy: null,
          issue_code: 'POLICY_FILE_MISSING'
        });
      }
      fd = fs.openSync(initial.path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
      const openedStat = fs.fstatSync(fd, { bigint: true });
      if (!openedStat.isFile() || openedStat.isSymbolicLink() || !isOwner(openedStat) || openedStat.nlink !== 1n || openedStat.size > BigInt(MAX_POLICY_BYTES)) {
        return Object.freeze({
          status: 'invalid',
          scope: 'account',
          temporal: 'current',
          observed_at: now,
          revision: 'unreadable',
          policy: null,
          issue_code: 'POLICY_FILE_UNSAFE'
        });
      }
      bytes = Buffer.alloc(Number(openedStat.size));
      fs.readSync(fd, bytes, 0, bytes.length, 0);
    } catch {
      return Object.freeze({
        status: 'invalid',
        scope: 'account',
        temporal: 'current',
        observed_at: now,
        revision: 'unreadable',
        policy: null,
        issue_code: 'POLICY_FILE_UNSAFE'
      });
    } finally {
      if (fd !== undefined) try { fs.closeSync(fd); } catch {}
    }

    const revision = createHash('sha256').update(bytes).digest('hex');

    // 5. Parse JSON
    let parsed;
    try {
      parsed = JSON.parse(bytes.toString('utf8'));
    } catch {
      return Object.freeze({
        status: 'invalid',
        scope: 'account',
        temporal: 'current',
        observed_at: now,
        revision,
        policy: null,
        issue_code: 'INVALID_JSON'
      });
    }

    // 6. Inspect schema state
    try {
      const inspected = inspectPolicy(parsed);
      if (inspected.migrationRequired) {
        return Object.freeze({
          status: 'migration_required',
          scope: 'account',
          temporal: 'current',
          observed_at: now,
          revision,
          policy: null,
          issue_code: 'V1_MIGRATION_REQUIRED'
        });
      }

      return Object.freeze({
        status: 'ready',
        scope: 'account',
        temporal: 'current',
        observed_at: now,
        revision,
        policy: inspected.policy,
        issue_code: null
      });
    } catch (err) {
      const code = err?.code || 'INVALID_POLICY';
      const isUnsupported = code.includes('UNSUPPORTED') || code.includes('BACKEND');
      return Object.freeze({
        status: isUnsupported ? 'unsupported' : 'invalid',
        scope: 'account',
        temporal: 'current',
        observed_at: now,
        revision,
        policy: null,
        issue_code: code
      });
    }
  }
}

module.exports = {
  PolicyProvider
};
