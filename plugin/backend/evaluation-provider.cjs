'use strict';

/**
 * @file evaluation-provider.cjs
 * Bound evaluation list, read, and compare provider for EVCrate Advisor Provider (Phase E01).
 *
 * Enforces descriptor-bound access (no directory scans), 8 MiB per document limit,
 * one-at-a-time parsing/hashing, provenance-preserving group aggregation,
 * and <= 1 MiB comparison page limits.
 */

const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { verifySafeRegularFile, isOwner } = require('./binding.cjs');
const { invalidInput } = require('./provider-errors.cjs');
const { validateEvaluationDocument } = require('./protocol-lib/advisor-evaluation-validation.js');
const { aggregateEvaluationGroups } = require('./protocol-lib/advisor-evaluation-comparison.js');

const MAX_EVALUATION_BYTES = 8 * 1024 * 1024; // 8 MiB
const MAX_PAGE_BYTES = 1024 * 1024; // 1 MiB

function loadEvaluationDocument(desc) {
  if (!desc?.path) return null;
  let fd;
  try {
    const fileInfo = verifySafeRegularFile(desc.path, MAX_EVALUATION_BYTES);
    if (!fileInfo) return null;
    fd = fs.openSync(fileInfo.path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const openedStat = fs.fstatSync(fd, { bigint: true });
    if (!openedStat.isFile() || openedStat.isSymbolicLink() || !isOwner(openedStat) || openedStat.nlink !== 1n || openedStat.size > BigInt(MAX_EVALUATION_BYTES)) {
      return null;
    }
    const bytes = Buffer.alloc(Number(openedStat.size));
    fs.readSync(fd, bytes, 0, bytes.length, 0);
    const digest = createHash('sha256').update(bytes).digest('hex');
    const parsed = JSON.parse(bytes.toString('utf8'));
    const doc = validateEvaluationDocument(parsed);
    return { doc, digest, size: bytes.length };
  } catch {
    return null;
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch {}
  }
}

function makeDescriptor(ref, sourceRevision, doc, digest) {
  const candidateCount = Array.isArray(doc.candidates) ? doc.candidates.length : 0;
  const caseCount = Array.isArray(doc.cases) ? doc.cases.length : 0;
  const observationCount = Array.isArray(doc.cases)
    ? doc.cases.reduce((sum, c) => sum + (Array.isArray(c.observations) ? c.observations.length : 0), 0)
    : 0;

  return Object.freeze({
    evaluation_ref: ref,
    source_revision: sourceRevision,
    source_digest: digest,
    evaluation_id: doc.evaluation_id,
    run_id: doc.run_id,
    created_at: doc.created_at,
    candidate_count: candidateCount,
    case_count: caseCount,
    observation_count: observationCount
  });
}

class EvaluationProvider {
  list(context, params = {}) {
    const now = Date.now();
    const bindingRevision = String(context.bindingRevision ?? 1);
    const descriptors = context.evaluationDescriptors || [];

    if (descriptors.length === 0) {
      return Object.freeze({
        status: 'not_configured',
        observed_at: now,
        binding_revision: bindingRevision,
        items: Object.freeze([]),
        next_cursor: null
      });
    }

    const items = [];
    for (const desc of descriptors) {
      const loaded = loadEvaluationDocument(desc);
      if (!loaded) continue;
      const ref = desc.evaluation_ref || desc.id;
      const rev = desc.expected_revision || loaded.digest;
      items.push(makeDescriptor(ref, rev, loaded.doc, loaded.digest));
    }

    const limit = Math.max(1, Math.min(100, Number(params.limit) || 32));
    const offset = Math.max(0, params.cursor ? Number(params.cursor) || 0 : 0);
    const paged = items.slice(offset, offset + limit);
    const nextOffset = offset + paged.length;
    const nextCursor = nextOffset < items.length ? String(nextOffset) : null;

    return Object.freeze({
      status: 'ready',
      observed_at: now,
      binding_revision: bindingRevision,
      items: Object.freeze(paged),
      next_cursor: nextCursor
    });
  }

  read(context, params) {
    if (!params?.evaluation_ref) throw invalidInput('evaluation_ref required');
    const ref = params.evaluation_ref;
    const expectedRev = params.expected_revision;
    const descriptors = context.evaluationDescriptors || [];
    const desc = descriptors.find((d) => (d.evaluation_ref || d.id) === ref);

    if (!desc) {
      return Object.freeze({ status: 'missing', evaluation_ref: ref, observed_revision: null });
    }

    const loaded = loadEvaluationDocument(desc);
    if (!loaded) {
      return Object.freeze({ status: 'missing', evaluation_ref: ref, observed_revision: null });
    }

    if (expectedRev && loaded.digest !== expectedRev) {
      return Object.freeze({ status: 'changed', evaluation_ref: ref, observed_revision: loaded.digest });
    }

    const descriptorObj = makeDescriptor(ref, loaded.digest, loaded.doc, loaded.digest);
    return Object.freeze({
      status: 'ready',
      descriptor: descriptorObj,
      document: loaded.doc
    });
  }

  compare(context, params) {
    if (!params || !Array.isArray(params.items) || params.items.length === 0) {
      throw invalidInput('items array required for compare');
    }

    const descriptors = context.evaluationDescriptors || [];
    const sourceRevisions = [];
    const documents = [];

    for (const item of params.items) {
      const ref = item.evaluation_ref;
      const expectedRev = item.expected_revision;
      const desc = descriptors.find((d) => (d.evaluation_ref || d.id) === ref);
      if (!desc) {
        return Object.freeze({ status: 'missing', evaluation_ref: ref, observed_revision: null });
      }
      const loaded = loadEvaluationDocument(desc);
      if (!loaded) {
        return Object.freeze({ status: 'missing', evaluation_ref: ref, observed_revision: null });
      }
      if (expectedRev && loaded.digest !== expectedRev) {
        return Object.freeze({ status: 'changed', evaluation_ref: ref, observed_revision: loaded.digest });
      }
      sourceRevisions.push({ evaluation_ref: ref, observed_revision: loaded.digest });
      documents.push(loaded.doc);
    }

    const allGroups = aggregateEvaluationGroups(documents);
    const limit = Math.max(1, Math.min(100, Number(params.limit) || 32));
    const offset = Math.max(0, params.cursor ? Number(params.cursor) || 0 : 0);
    let paged = allGroups.slice(offset, offset + limit);

    while (paged.length > 0 && Buffer.byteLength(JSON.stringify(paged), 'utf8') > MAX_PAGE_BYTES) {
      paged = paged.slice(0, paged.length - 1);
    }

    const nextOffset = offset + paged.length;
    const nextCursor = nextOffset < allGroups.length ? String(nextOffset) : null;
    const returnedBytes = Buffer.byteLength(JSON.stringify(paged), 'utf8');

    return Object.freeze({
      status: 'ready',
      source_revisions: Object.freeze(sourceRevisions),
      groups: Object.freeze(paged),
      next_cursor: nextCursor,
      returned_bytes: returnedBytes
    });
  }
}

module.exports = {
  EvaluationProvider,
  loadEvaluationDocument,
  MAX_EVALUATION_BYTES
};
