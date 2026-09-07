import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  validateAdvisorPolicy, safeAdvisorPolicyView, proposeAdvisorPolicyMigration,
  validateLegacyAdvisorPolicy
} from '../../dist/protocol/advisor-settings.js';

const require = createRequire(import.meta.url);
const {
  validatePolicy, inspectPolicy, proposeMigration, validateLegacyPolicy
} = require('../../.evcrate/source/.evcrate/bin/lib/advisor/policy-schema.cjs');

const VALID_V2_POLICIES = [
  {
    name: 'minimal valid v2',
    policy: {
      version: 2,
      advisor: {
        primary: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
        backup: { backend: 'omp', model: 'openai-codex/gpt-5.6-sol', effort: 'high' }
      },
      wait: { mode: 'until_terminal', warn_after_ms: 120_000, warn_every_ms: 300_000 },
      history: { retention_days: 30, max_bytes: 104_857_600 }
    }
  },
  {
    name: 'boundary values v2',
    policy: {
      version: 2,
      advisor: {
        primary: { backend: 'claude', model: 'm1', effort: 'e1' },
        backup: { backend: 'pi', model: 'm2', effort: 'e2' }
      },
      wait: { mode: 'until_terminal', warn_after_ms: 1000, warn_every_ms: 3_600_000 },
      history: { retention_days: 1, max_bytes: 1_048_576 }
    }
  },
  {
    name: 'maximum bounds v2',
    policy: {
      version: 2,
      advisor: {
        primary: { backend: 'antigravity', model: 'm3', effort: 'e3' },
        backup: { backend: 'codex', model: 'm4', effort: 'e4' }
      },
      wait: { mode: 'until_terminal', warn_after_ms: 3_600_000, warn_every_ms: 1000 },
      history: { retention_days: 365, max_bytes: 1_073_741_824 }
    }
  }
];

const INVALID_POLICIES = [
  {
    name: 'missing version',
    policy: {
      advisor: {
        primary: { backend: 'codex', model: 'm', effort: 'h' },
        backup: { backend: 'omp', model: 'm', effort: 'h' }
      },
      wait: { mode: 'until_terminal', warn_after_ms: 120_000, warn_every_ms: 300_000 },
      history: { retention_days: 30, max_bytes: 104_857_600 }
    },
    cjsCode: 'ROUTE_SCHEMA_INVALID'
  },
  {
    name: 'legacy version 1 policy',
    policy: {
      version: 1,
      advisor: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high', timeout_ms: 60_000 }
    },
    cjsCode: 'ROUTE_SCHEMA_V1_MIGRATION_REQUIRED'
  },
  {
    name: 'legacy host routes',
    policy: {
      version: 1,
      hosts: { codex: {} }
    },
    cjsCode: 'ROUTE_SCHEMA_MIGRATION_REQUIRED'
  },
  {
    name: 'future unsupported version 3',
    policy: {
      version: 3,
      advisor: {
        primary: { backend: 'codex', model: 'm', effort: 'h' },
        backup: { backend: 'omp', model: 'm', effort: 'h' }
      },
      wait: { mode: 'until_terminal', warn_after_ms: 120_000, warn_every_ms: 300_000 },
      history: { retention_days: 30, max_bytes: 104_857_600 }
    },
    cjsCode: 'ROUTE_SCHEMA_INVALID'
  },
  {
    name: 'identical primary and backup route triples',
    policy: {
      version: 2,
      advisor: {
        primary: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' },
        backup: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' }
      },
      wait: { mode: 'until_terminal', warn_after_ms: 120_000, warn_every_ms: 300_000 },
      history: { retention_days: 30, max_bytes: 104_857_600 }
    },
    cjsCode: 'ROUTE_BACKUP_IDENTICAL'
  },
  {
    name: 'unsupported backend',
    policy: {
      version: 2,
      advisor: {
        primary: { backend: 'gemini', model: 'gpt-5.6-sol', effort: 'high' },
        backup: { backend: 'omp', model: 'gpt-5.6-sol', effort: 'high' }
      },
      wait: { mode: 'until_terminal', warn_after_ms: 120_000, warn_every_ms: 300_000 },
      history: { retention_days: 30, max_bytes: 104_857_600 }
    },
    cjsCode: 'ROUTE_ENTRY_INVALID'
  },
  {
    name: 'credential field present',
    policy: {
      version: 2,
      advisor: {
        primary: { backend: 'codex', model: 'm', effort: 'h' },
        backup: { backend: 'omp', model: 'm', effort: 'h' }
      },
      wait: { mode: 'until_terminal', warn_after_ms: 120_000, warn_every_ms: 300_000 },
      history: { retention_days: 30, max_bytes: 104_857_600 },
      api_key: 'secret'
    },
    cjsCode: 'ROUTE_CREDENTIAL_FIELD'
  },
  {
    name: 'wait mode invalid',
    policy: {
      version: 2,
      advisor: {
        primary: { backend: 'codex', model: 'm', effort: 'h' },
        backup: { backend: 'omp', model: 'm', effort: 'h' }
      },
      wait: { mode: 'fixed_timeout', warn_after_ms: 120_000, warn_every_ms: 300_000 },
      history: { retention_days: 30, max_bytes: 104_857_600 }
    },
    cjsCode: 'ROUTE_ENTRY_INVALID'
  },
  {
    name: 'warn_after_ms below minimum',
    policy: {
      version: 2,
      advisor: {
        primary: { backend: 'codex', model: 'm', effort: 'h' },
        backup: { backend: 'omp', model: 'm', effort: 'h' }
      },
      wait: { mode: 'until_terminal', warn_after_ms: 999, warn_every_ms: 300_000 },
      history: { retention_days: 30, max_bytes: 104_857_600 }
    },
    cjsCode: 'ROUTE_ENTRY_INVALID'
  },
  {
    name: 'history retention_days above maximum',
    policy: {
      version: 2,
      advisor: {
        primary: { backend: 'codex', model: 'm', effort: 'h' },
        backup: { backend: 'omp', model: 'm', effort: 'h' }
      },
      wait: { mode: 'until_terminal', warn_after_ms: 120_000, warn_every_ms: 300_000 },
      history: { retention_days: 366, max_bytes: 104_857_600 }
    },
    cjsCode: 'ROUTE_ENTRY_INVALID'
  },
  {
    name: 'history max_bytes below minimum',
    policy: {
      version: 2,
      advisor: {
        primary: { backend: 'codex', model: 'm', effort: 'h' },
        backup: { backend: 'omp', model: 'm', effort: 'h' }
      },
      wait: { mode: 'until_terminal', warn_after_ms: 120_000, warn_every_ms: 300_000 },
      history: { retention_days: 30, max_bytes: 1_048_575 }
    },
    cjsCode: 'ROUTE_ENTRY_INVALID'
  }
];

test('TS and CJS policy validators accept identical valid v2 policies', () => {
  for (const { name, policy } of VALID_V2_POLICIES) {
    const tsResult = validateAdvisorPolicy(policy);
    const cjsResult = validatePolicy(policy);
    assert.deepEqual(tsResult, cjsResult, `Mismatch for ${name}`);
    assert.equal(Object.isFrozen(tsResult), true);
    assert.equal(Object.isFrozen(cjsResult), true);
  }
});

test('TS and CJS policy validators reject identical invalid policies with mapped errors', () => {
  for (const { name, policy, cjsCode } of INVALID_POLICIES) {
    assert.throws(() => validateAdvisorPolicy(policy), (err) => err.code === 'SETTINGS_INVALID', `TS accepted ${name}`);
    assert.throws(() => validatePolicy(policy), (err) => err.code === cjsCode, `CJS error mismatch for ${name}`);
  }
});

test('TS and CJS legacy policy inspection parity', () => {
  const legacyPolicy = {
    version: 1,
    advisor: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high', timeout_ms: 60_000 }
  };

  const tsLegacy = validateLegacyAdvisorPolicy(legacyPolicy);
  const cjsLegacy = validateLegacyPolicy(legacyPolicy);
  assert.deepEqual(tsLegacy, cjsLegacy);

  const tsView = safeAdvisorPolicyView(legacyPolicy);
  const cjsInspection = inspectPolicy(legacyPolicy);
  assert.equal(tsView.version, 1);
  assert.equal(tsView.migration_required, true);
  assert.equal(cjsInspection.legacy, true);
  assert.equal(cjsInspection.migrationRequired, true);

  const backupRoute = { backend: 'omp', model: 'openai-codex/gpt-5.6-sol', effort: 'high' };
  const tsProposal = proposeAdvisorPolicyMigration(legacyPolicy, backupRoute);
  const cjsProposal = proposeMigration(legacyPolicy, backupRoute);
  assert.deepEqual(tsProposal, cjsProposal);
  assert.doesNotThrow(() => validateAdvisorPolicy(tsProposal));
  assert.doesNotThrow(() => validatePolicy(cjsProposal));

  // Both reject identical backup routes
  const identicalBackup = { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high' };
  assert.throws(() => proposeAdvisorPolicyMigration(legacyPolicy, identicalBackup));
  assert.throws(() => proposeMigration(legacyPolicy, identicalBackup));
});

test('safeAdvisorPolicyView rejects legacy input with hosts, extra keys, or false migration_required', () => {
  const validLegacy = {
    version: 1,
    advisor: { backend: 'codex', model: 'gpt-5.6-sol', effort: 'high', timeout_ms: 60_000 }
  };
  assert.throws(() => safeAdvisorPolicyView({ ...validLegacy, hosts: {} }));
  assert.throws(() => safeAdvisorPolicyView({ ...validLegacy, api_key: 'secret' }));
  assert.throws(() => safeAdvisorPolicyView({ ...validLegacy, migration_required: false }));
  assert.doesNotThrow(() => safeAdvisorPolicyView({ ...validLegacy, migration_required: true }));
});
