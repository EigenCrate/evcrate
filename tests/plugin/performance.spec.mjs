/**
 * @file performance.spec.mjs
 * Local framed-worker workload measurement for EVCrate's 10k history path.
 *
 * This measures the actual worker process over its framed stdin/stdout protocol.
 * It is not a DamHopper API, separate-LAN, or G4 qualification benchmark.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const WORKER_PATH = path.join(ROOT_DIR, 'plugin', 'backend', 'worker.cjs');
const pluginRequire = createRequire(new URL('../../plugin/package.json', import.meta.url));
const { encodeFrame, FrameDecoder, RUNNER_PROTOCOL_VERSION } = pluginRequire('@dam-hopper/plugin-sdk');
const { populateLargeHistoryOnDisk } = await import('./generate-large-history-fixture.mjs');

const HISTORY_QUERY = Object.freeze({
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
});

function nearestRank(values, percentile = 0.95) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(1, Math.ceil(percentile * sorted.length)) - 1];
}

function workerHighWaterRssBytes(pid) {
  try {
    const status = fs.readFileSync(`/proc/${pid}/status`, 'utf8');
    const match = /^VmHWM:\s+(\d+)\s+kB$/m.exec(status);
    return match ? Number(match[1]) * 1024 : 0;
  } catch {
    return 0;
  }
}

class FramedWorker {
  constructor(home) {
    this.child = spawn(process.execPath, [WORKER_PATH], {
      cwd: ROOT_DIR,
      env: { HOME: home, PATH: process.env.PATH ?? '', NODE_ENV: 'test' },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    this.decoder = new FrameDecoder();
    this.pending = new Map();
    this.sequence = 0;
    this.maxFramePayloadBytes = 0;
    this.maxStdoutChunkBytes = 0;
    this.peakRssBytes = 0;
    this.failure = null;
    this.closing = false;
    this.child.stdout.on('data', (chunk) => this.onStdout(chunk));
    this.child.stderr.on('data', () => {});
    this.child.on('error', (error) => this.fail(error));
    this.child.on('exit', (code, signal) => {
      if (!this.closing || this.pending.size > 0) {
        this.fail(new Error(`Worker exited before all responses settled (${code ?? signal})`));
      }
    });
    this.rssSampler = setInterval(() => {
      this.peakRssBytes = Math.max(this.peakRssBytes, workerHighWaterRssBytes(this.child.pid));
    }, 20);
  }

  fail(error) {
    if (this.failure) return;
    this.failure = error;
    for (const [id, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(error);
      this.pending.delete(id);
    }
  }

  onStdout(chunk) {
    this.maxStdoutChunkBytes = Math.max(this.maxStdoutChunkBytes, chunk.byteLength);
    this.peakRssBytes = Math.max(this.peakRssBytes, workerHighWaterRssBytes(this.child.pid));
    let frames;
    try {
      frames = this.decoder.push(new Uint8Array(chunk));
    } catch (error) {
      this.fail(error);
      return;
    }
    for (const frame of frames) {
      this.maxFramePayloadBytes = Math.max(this.maxFramePayloadBytes, Buffer.byteLength(frame, 'utf8'));
      let message;
      try {
        message = JSON.parse(frame);
      } catch (error) {
        this.fail(error);
        return;
      }
      const entry = this.pending.get(message.id);
      if (!entry) continue;
      this.pending.delete(message.id);
      clearTimeout(entry.timer);
      entry.resolve({
        message,
        startedAt: entry.startedAt,
        completedAt: performance.now()
      });
    }
  }

  request(method, params = {}) {
    if (this.failure) throw this.failure;
    const id = `e05-${++this.sequence}`;
    const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params });
    const encoded = encodeFrame(payload);
    this.maxFramePayloadBytes = Math.max(this.maxFramePayloadBytes, Buffer.byteLength(payload, 'utf8'));
    const startedAt = performance.now();
    let resolve;
    let reject;
    const response = new Promise((res, rej) => { resolve = res; reject = rej; });
    const timer = setTimeout(() => {
      this.pending.delete(id);
      reject(new Error(`Timed out waiting for worker method ${method}`));
    }, 30000);
    this.pending.set(id, { resolve, reject, startedAt, timer });
    this.child.stdin.write(Buffer.from(encoded));
    return { id, response };
  }

  async invoke(contextId, operation, payload = {}) {
    const request = this.request('plugin.invoke', { contextId, operation, payload });
    const result = await request.response;
    if (result.message.error) {
      throw new Error(`${operation} failed with ${result.message.error.code}`);
    }
    return {
      value: result.message.result.result,
      elapsedMs: result.completedAt - result.startedAt
    };
  }

  async close() {
    clearInterval(this.rssSampler);
    this.closing = true;
    if (this.child.exitCode === null && this.child.signalCode === null) {
      await new Promise((resolve) => {
        this.child.once('exit', resolve);
        this.child.kill('SIGTERM');
      });
    }
  }
}

test('E05 local framed-worker 10k workload records actual request and cancellation samples', {
  skip: process.platform !== 'linux',
  timeout: 300000
}, async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-worker-10k-'));
  const home = path.join(tmpRoot, 'home');
  const project = path.join(tmpRoot, 'project');
  const historyRoot = path.join(home, '.evcrate', 'advisor-history');
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(project, { recursive: true });
  const target = path.normalize(project);
  const projectId = crypto.createHash('sha256').update(target, 'utf8').digest('hex');
  let client = null;

  try {
    const corpus = await populateLargeHistoryOnDisk(historyRoot, 10000, 12345, projectId, { includeBenchmarkCases: true });
    assert.equal(corpus.discoveredConsultations, 10000);
    assert.equal(corpus.duplicateIdentityCopies, 1);
    assert.equal(corpus.diagnosticRecords, 1);
    assert.ok(corpus.validOutcomeRecords > 0 && corpus.missingOutcomeRecords > 0 && corpus.invalidOutcomeRecords > 0);
    assert.equal(corpus.invalidOutcomeRecords, 97, 'includes the invalid outcome written at the conflicting duplicate path');
    client = new FramedWorker(home);
    const helloRequest = client.request('runner.hello', {
      clientProtocolVersion: RUNNER_PROTOCOL_VERSION,
      supportedCapabilities: ['history.refresh', 'history.summary', 'history.page', 'history.detail']
    });
    const hello = await helloRequest.response;
    assert.equal(hello.message.error, undefined, `runner.hello failed: ${JSON.stringify(hello.message)}`);
    assert.equal(hello.message.result.negotiatedProtocolVersion, RUNNER_PROTOCOL_VERSION);

    const openRequest = client.request('context.open', {
      actorSubject: 'e05-local-benchmark',
      installationId: 'e05-local-benchmark',
      configuredProjectTarget: target,
      allowedOperations: ['history.refresh', 'history.summary', 'history.page', 'history.detail'],
      apiConnectionEpoch: 1,
      activationGeneration: 1,
      bindingRevision: 1,
      grantRevision: 1
    });
    const opened = await openRequest.response;
    assert.equal(opened.message.error, undefined, `context.open failed: ${JSON.stringify(opened.message)}`);
    const contextId = opened.message.result.contextId;

    const refreshSamplesMs = [];
    let snapshotId;
    for (let index = 0; index < 5; index += 1) {
      const sample = await client.invoke(contextId, 'history.refresh');
      assert.equal(sample.value.state, 'fresh');
      assert.equal(sample.value.scan.consultations_discovered, corpus.discoveredConsultations);
      assert.equal(sample.value.scan.accepted_records, 9999);
      assert.equal(sample.value.scan.invalid_records, 1);
      assert.ok(sample.value.scan.diagnostics.some((item) => item.code === 'EXECUTION_INVALID_JSON'));
      snapshotId = sample.value.snapshot_id;
      refreshSamplesMs.push(sample.elapsedMs);
    }

    const summarySamplesMs = [];
    let workloadCoverage = null;
    for (let index = 0; index < 20; index += 1) {
      const sample = await client.invoke(contextId, 'history.summary', {
        snapshot_id: snapshotId,
        query: HISTORY_QUERY
      });
      const metrics = sample.value.metrics;
      assert.equal(metrics.counts.consultations, 9997);
      if (index === 0) {
        assert.ok(metrics.counts.outcome_states.valid > 0, 'Fixture must include valid outcomes');
        assert.ok(metrics.counts.outcome_states.missing > 0, 'Fixture must include missing outcomes');
        assert.ok(metrics.counts.outcome_states.invalid > 0, 'Fixture must include invalid outcomes');
        assert.ok(metrics.counts.statuses.FAILED > 0, 'Fixture must include terminal failures');
        assert.equal(metrics.metrics.failures.attempts.fatal, metrics.counts.statuses.FAILED);
        assert.ok(metrics.metrics.failures.execution.some((failure) => failure.code === 'PROCESS_FAILED' && failure.category === 'fatal'));
        assert.equal(metrics.scan.consultations_discovered, corpus.discoveredConsultations);
        assert.equal(metrics.scan.accepted_records, 9997);
        assert.equal(metrics.scan.invalid_records, 3);
        assert.ok(metrics.scan.diagnostics.some((item) => item.code === 'DUPLICATE_IDENTITY'));
        assert.ok(metrics.scan.diagnostics.some((item) => item.code === 'EXECUTION_INVALID_JSON'));
        workloadCoverage = {
          outcomeStates: metrics.counts.outcome_states,
          scan: {
            consultationsDiscovered: metrics.scan.consultations_discovered,
            acceptedRecords: metrics.scan.accepted_records,
            invalidRecords: metrics.scan.invalid_records,
            diagnosticCodes: metrics.scan.diagnostics.map((item) => item.code)
          }
        };
      }
      summarySamplesMs.push(sample.elapsedMs);
    }

    const pageSamplesMs = [];
    let cursor = null;
    let firstPage;
    for (let index = 0; index < 20; index += 1) {
      const sample = await client.invoke(contextId, 'history.page', {
        snapshot_id: snapshotId,
        query: HISTORY_QUERY,
        sort: 'started_at_desc',
        cursor,
        limit: 50
      });
      assert.equal(sample.value.entries.length, 50);
      if (index === 0) firstPage = sample.value.entries;
      pageSamplesMs.push(sample.elapsedMs);
      cursor = sample.value.next_cursor;
    }

    const detailSamplesMs = [];
    for (const entry of firstPage.slice(0, 20)) {
      const sample = await client.invoke(contextId, 'history.detail', {
        snapshot_id: snapshotId,
        record_ref: entry.record_ref
      });
      assert.equal(sample.value.status, 'ready');
      detailSamplesMs.push(sample.elapsedMs);
    }

    const cancellationAckSamplesMs = [];
    const cooperativeSettlementSamplesMs = [];
    const cancellationOutcomes = { accepted: 0, alreadySettled: 0, unknown: 0 };
    let acceptedButCompletedCount = 0;
    const cancellationAttempts = [];
    for (let attempt = 0; attempt < 100 && cooperativeSettlementSamplesMs.length < 20; attempt += 1) {
      const operation = client.request('plugin.invoke', {
        contextId,
        operation: 'history.refresh',
        payload: {}
      });
      const cancelStartedAt = performance.now();
      const cancellation = client.request('request.cancel', {
        contextId,
        requestId: operation.id
      });
      const cancelReply = await cancellation.response;
      assert.equal(cancelReply.message.error, undefined);
      const outcome = cancelReply.message.result.outcome;
      assert.ok(Object.hasOwn(cancellationOutcomes, outcome), `Unexpected cancellation outcome: ${outcome}`);
      cancellationOutcomes[outcome] += 1;
      const cancellationAckMs = cancelReply.completedAt - cancelReply.startedAt;
      cancellationAckSamplesMs.push(cancellationAckMs);

      const settled = await operation.response;
      assert.ok(settled.message.result || settled.message.error, 'Original request must settle exactly once');
      const originalErrorCode = settled.message.error?.code ?? null;
      const originalResult = settled.message.result?.result ?? null;
      const originalResultState = originalResult?.state ?? null;
      const originalStaleReason = originalResult?.stale_reason ?? null;
      const settlementMs = settled.completedAt - cancelStartedAt;
      cancellationAttempts.push({ outcome, cancellationAckMs, originalErrorCode, originalResultState, originalStaleReason, settlementMs });
      if (outcome === 'accepted') {
        const cooperativelyCancelled = originalErrorCode === 'CANCELLED'
          || (originalResultState === 'stale' && originalStaleReason === 'cancelled');
        if (cooperativelyCancelled) {
          cooperativeSettlementSamplesMs.push(settlementMs);
        } else {
          assert.equal(originalErrorCode, null, 'Accepted cancellation must either cancel or complete successfully');
          assert.ok(originalResult, 'Successful original response must include the operation result');
          acceptedButCompletedCount += 1;
        }
      }
    }
    assert.equal(cooperativeSettlementSamplesMs.length, 20, `Expected 20 accepted cancellations with cancelled original operations; outcomes: ${JSON.stringify(cancellationOutcomes)}, acceptedButCompleted: ${acceptedButCompletedCount}`);
    client.peakRssBytes = Math.max(client.peakRssBytes, workerHighWaterRssBytes(client.child.pid));
    const evidence = {
      scope: 'local-framed-worker-only',
      corpus: {
        consultations: workloadCoverage.scan.acceptedRecords,
        consultationsDiscovered: corpus.discoveredConsultations,
        files: corpus.totalFiles,
        inputBytes: corpus.totalBytes,
        sha256: corpus.corpusDigest,
        generatedOutcomeRecords: {
          valid: corpus.validOutcomeRecords,
          missing: corpus.missingOutcomeRecords,
          invalid: corpus.invalidOutcomeRecords
        },
        duplicateIdentityCopies: corpus.duplicateIdentityCopies,
        diagnosticRecords: corpus.diagnosticRecords
      },
      coverage: workloadCoverage,
      transport: {
        requestResponse: 'worker JSON-RPC over framed stdio',
        maximumFramePayloadBytes: client.maxFramePayloadBytes,
        maximumObservedStdoutChunkBytes: client.maxStdoutChunkBytes
      },
      worker: {
        peakRssBytes: client.peakRssBytes,
        peakRssMiB: Number((client.peakRssBytes / (1024 * 1024)).toFixed(2))
      },
      samples: {
        refreshMs: refreshSamplesMs,
        refreshP95Ms: nearestRank(refreshSamplesMs),
        summaryMs: summarySamplesMs,
        summaryP95Ms: nearestRank(summarySamplesMs),
        pageMs: pageSamplesMs,
        pageP95Ms: nearestRank(pageSamplesMs),
        detailMs: detailSamplesMs,
        detailP95Ms: nearestRank(detailSamplesMs),
        cancellationAckMs: cancellationAckSamplesMs,
        cancellationAckP95Ms: nearestRank(cancellationAckSamplesMs),
        cooperativeSettlementMs: cooperativeSettlementSamplesMs,
        cooperativeSettlementP95Ms: nearestRank(cooperativeSettlementSamplesMs),
        cancellationOutcomes,
        acceptedButCompletedCount,
        cancellationAttempts
      },
      notMeasured: [
        'DamHopper API and runner RSS',
        'separate-LAN RTT and browser long tasks',
        'retained snapshot bytes and aggregate serialization memory',
        'host lifecycle/update/revoke/disable race'
      ]
    };
    console.log(`E05 local worker measurements: ${JSON.stringify(evidence)}`);
  } finally {
    if (client) await client.close();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});
