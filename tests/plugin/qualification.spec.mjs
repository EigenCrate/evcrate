/**
 * Local evidence checks for the joint G4 qualification gate.
 *
 * These tests verify EVCrate-owned behavior only. They do not qualify DamHopper,
 * a separate LAN browser, deployment lifecycle, or G4 sign-off.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { EVCrateAdvisorProvider } from '../../plugin/backend/provider.cjs';
import { SnapshotStore } from '../../plugin/backend/snapshot-store.cjs';
import { populateLargeHistoryOnDisk } from './generate-large-history-fixture.mjs';
import {
  REQUIRED_SCENARIOS,
  validateQualificationReport
} from './qualification-report-schema.mjs';

function hashTree(root) {
  const files = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const fullPath = path.join(directory, entry.name);
      const relativePath = path.relative(root, fullPath);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const mode = fs.statSync(fullPath).mode & 0o777;
        const digest = crypto.createHash('sha256').update(fs.readFileSync(fullPath)).digest('hex');
        files.push(`${relativePath}\0${mode.toString(8)}\0${digest}`);
      }
    }
  }
  walk(root);
  return crypto.createHash('sha256').update(files.join('\n')).digest('hex');
}

test('G4 evidence validator rejects all-passed scenarios without raw proof or LAN measurements', () => {
  const report = {
    gate: { status: 'accepted', g0Revision: 'G0-1', acceptedAt: new Date().toISOString() },
    scenarios: REQUIRED_SCENARIOS.map((id) => ({ id, status: 'passed' })),
    benchmark10k: {
      transport: 'in-process',
      corpusDigest: 'a'.repeat(64),
      totalConsultations: 10000,
      refreshSamples: Array(5).fill(1),
      refreshP95Ms: 1,
      summarySamples: Array(20).fill(1),
      summaryP95Ms: 1,
      pageSamples: Array(20).fill(1),
      pageP95Ms: 1,
      detailSamples: Array(20).fill(1),
      detailP95Ms: 1,
      cancellationAckSamples: Array(20).fill(1),
      cancellationAckP95Ms: 1,
      cooperativeSettlementSamples: Array(20).fill(1),
      cooperativeSettlementP95Ms: 1,
      rttSamples: Array(20).fill(1),
      rttP95Ms: 1,
      resourcePeaks: {
        apiRssMb: 1,
        workerRssMb: 1,
        snapshotBytes: 1,
        bufferedFrameBytes: 1,
        frameSizeMaxBytes: 1,
        cpuUserMs: 1,
        cpuSystemMs: 1,
        browserLongTaskCount: 0
      }
    }
  };

  const validation = validateQualificationReport(report);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => error.includes('security G4 disposition')));
  assert.ok(validation.errors.some((error) => error.includes('immutable evidence URI')));
  assert.ok(validation.errors.some((error) => error.includes('separate LAN browser')));
  assert.ok(validation.errors.some((error) => error.includes('rawEvidence')));
  assert.ok(validation.errors.some((error) => error.includes('Resource ceilings')));
});

test('Local history read operations preserve source bytes and modes', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-g4-source-'));
  const projectRoot = path.join(tmpRoot, 'project');
  const historyRoot = path.join(tmpRoot, 'advisor-history');
  fs.mkdirSync(projectRoot);

  try {
    const target = path.normalize(projectRoot);
    const projectId = crypto.createHash('sha256').update(target, 'utf8').digest('hex');
    await populateLargeHistoryOnDisk(historyRoot, 1, 12345, projectId);
    const before = hashTree(historyRoot);
    const provider = new EVCrateAdvisorProvider({
      context_id: 'ctx-g4-source',
      target,
      history_identity: projectId,
      binding_revision: 1,
      allowed_operations: ['history.refresh', 'history.summary', 'history.page', 'history.detail']
    }, {
      snapshotStore: new SnapshotStore(),
      historyRootPath: historyRoot
    });

    const refresh = await provider.invoke('history.refresh', {});
    assert.equal(refresh.state, 'fresh');

    const query = {
      task_run_id: null,
      filters: {
        statuses: null,
        outcome_states: null,
        outcome_results: null,
        backends: null,
        models: null,
        efforts: null,
        prompt_identities: null,
        build_identities: null,
        started_at_from: null,
        started_at_to: null
      }
    };
    const summary = await provider.invoke('history.summary', {
      snapshot_id: refresh.snapshot_id,
      query
    });
    const page = await provider.invoke('history.page', {
      snapshot_id: refresh.snapshot_id,
      query,
      sort: 'started_at_desc',
      cursor: null,
      limit: 100
    });
    assert.equal(summary.metrics.counts.consultations, 1);
    assert.equal(page.entries.length, 1);
    const detail = await provider.invoke('history.detail', {
      snapshot_id: refresh.snapshot_id,
      record_ref: page.entries[0].record_ref
    });
    assert.equal(detail.status, 'ready');

    assert.equal(hashTree(historyRoot), before, 'refresh, summary, page, and detail must not alter source files');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});
