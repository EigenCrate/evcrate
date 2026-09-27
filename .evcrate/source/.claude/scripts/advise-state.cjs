#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { ADVICE_DIR } = require('../hooks/lib/evcrate-paths.cjs');

const MAX_BYTES = 64 * 1024;
const FAILURE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const TOMBSTONE_RETENTION_MS = 24 * 60 * 60 * 1000;
const LOCK_STALE_MS = 10 * 60 * 1000;
const REPORT_MAX_BYTES = 32 * 1024;
const REQUIRED_REPORT_HEADINGS = ['Reframed problem', 'Recommendation', 'Alternatives/tradeoffs', 'Risks', 'Assumptions/evidence gaps', 'Success checks', 'Next actions', 'Unresolved questions'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CREDENTIAL_PREFIX = '(?:["\\\']?(?:api[_ -]?key|token|secret|password|passwd|authorization|cookie|credential)["\\\']?\\s*[:=]\\s*)';
const CREDENTIAL_OBJECT = new RegExp(`(${CREDENTIAL_PREFIX})(?:\\{[^{}]{0,8192}\\}|\\[[^\\[\\]]{0,8192}\\])`, 'gi');
const CREDENTIAL_ASSIGNMENT = new RegExp(`(${CREDENTIAL_PREFIX}(?:(?:Bearer)\\s+)?)(?:"[^"]*"|'[^']*'|[^\\s,;}]+)`, 'gi');
const CREDENTIAL_VALUE = /["']?(?:api[_ -]?key|token|secret|password|passwd|authorization|cookie|credential)["']?\s*[:=]\s*(?:(?:Bearer)\s+)?(?:"([^"]*)"|'([^']*)'|([^\s,;}]+))/gi;
const REDACTED_VALUE = /^\[REDACTED(?:_[A-Z_]+)?\]$/i;
const STATES = new Set(['active', 'paused', 'failed']);
const PHASES = new Set(['discovery', 'confirm_reframe', 'failed']);
const TYPES = new Set(['discovery', 'confirm_reframe']);
const KEYS = new Set(['schema', 'version', 'projectKey', 'invocationId', 'createdAt', 'updatedAt', 'phase', 'status', 'originalInput', 'questions', 'reframe', 'pendingQuestion', 'reportPath', 'lastFailureCode']);
const QUESTION_KEYS = new Set(['id', 'type', 'text', 'answer', 'askedAt', 'answeredAt']);
const PENDING_KEYS = new Set(['id', 'type', 'text']);
const TOMBSTONE_KEYS = new Set(['schema', 'version', 'projectKey', 'invocationId', 'completedAt', 'reportPath']);

function error(code, message) { const result = new Error(message); result.code = code; throw result; }
function bytes(value) { return Buffer.byteLength(String(value), 'utf8'); }
function redact(value) {
  const redacted = String(value ?? '')
    .replace(/-----BEGIN [^-]+ PRIVATE KEY-----[\s\S]*?-----END [^-]+ PRIVATE KEY-----/gi, '[REDACTED_PRIVATE_KEY]')
    .replace(/\bBearer\s+(?:"[^"]*"|'[^']*'|[A-Za-z0-9._~+/=-]+)/gi, 'Bearer [REDACTED]')
    .replace(CREDENTIAL_OBJECT, '$1[REDACTED]')
    .replace(CREDENTIAL_ASSIGNMENT, '$1[REDACTED]');
  if (hasUnredactedCredential(redacted) || new RegExp(`${CREDENTIAL_PREFIX}(?!\\[REDACTED(?:_[A-Z_]+)?\\])[\\[{]`, 'i').test(redacted)) return '[REDACTED]';
  return redacted;
}
function bounded(value, limit = 4096) {
  const redacted = redact(value);
  if (bytes(redacted) <= limit) return redacted;
  return `${Buffer.from(redacted, 'utf8').subarray(0, limit - 12).toString('utf8')}…[truncated]`;
}
function projectRoot(value = process.cwd()) {
  let current;
  try { current = fs.realpathSync(value); } catch { error('PROJECT_ROOT_INVALID', 'Project root does not resolve'); }
  for (;;) {
    const marker = path.join(current, '.evcrate');
    try {
      const stat = fs.lstatSync(marker);
      if (stat.isSymbolicLink() || !stat.isDirectory()) error('PROJECT_ROOT_INVALID', 'Project marker is not a directory');
      return current;
    } catch (cause) {
      if (cause.code !== 'ENOENT') throw cause;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  error('PROJECT_ROOT_INVALID', 'Project root is not an EVCrate repository');
}
function projectKey(root) {
  const name = path.basename(root).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'project';
  return `${name}-${crypto.createHash('sha256').update(root).digest('hex').slice(0, 12)}`;
}
function within(root, candidate) { const relative = path.relative(path.resolve(root), path.resolve(candidate)); return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)); }
function rejectSymlinkAncestors(root, candidate) {
  let current = path.resolve(candidate); const boundary = path.resolve(root);
  while (within(boundary, current)) {
    try { if (fs.lstatSync(current).isSymbolicLink()) error('STATE_FILE_TYPE', 'Symlinked state path is not allowed'); } catch (cause) { if (cause.code !== 'ENOENT') throw cause; }
    if (current === boundary) break;
    current = path.dirname(current);
  }
}
function runtimePaths(options) {
  const runtime = path.resolve(options.runtimeRoot || ADVICE_DIR);
  if (runtime === path.resolve(os.tmpdir()) || !within(os.tmpdir(), runtime)) error('STATE_CONTAINMENT', 'Runtime root must be below the system temporary directory');
  const version = path.join(runtime, 'v1'); const keyRoot = path.join(version, projectKey(projectRoot(options.projectRoot)));
  rejectSymlinkAncestors(os.tmpdir(), keyRoot);
  return { runtime, version, keyRoot };
}
function ensureRuntimeTree(options) { const paths = runtimePaths(options); ensureDirectory(paths.runtime); ensureDirectory(paths.version); ensureDirectory(paths.keyRoot); return paths; }
function existing(file) { try { return fs.lstatSync(file); } catch (cause) { if (cause.code === 'ENOENT') return null; throw cause; } }
function secureStat(file, kind) {
  let stat; try { stat = fs.lstatSync(file); } catch { error('STATE_MISSING', `Missing ${kind}`); }
  if (stat.isSymbolicLink() || !stat.isFile() && kind === 'file' || !stat.isDirectory() && kind === 'directory') error('STATE_FILE_TYPE', `Invalid ${kind}`);
  return stat;
}
function invocationPath(options, id) {
  const root = projectRoot(options.projectRoot);
  if (!UUID.test(id)) error('INVALID_INVOCATION', 'Invocation ID must be a UUID');
  const paths = runtimePaths({ ...options, projectRoot: root });
  const base = paths.keyRoot;
  const directory = path.join(base, id);
  if (!within(base, directory)) error('STATE_CONTAINMENT', 'Invocation path escapes runtime root');
  const context = { root, base, directory, state: path.join(directory, 'state.json'), tombstone: path.join(directory, 'tombstone.json'), lock: path.join(directory, 'state.lock'), key: projectKey(root) };
  validateInvocationDirectory(context);
  return context;
}
function validateInvocationDirectory(context) {
  rejectSymlinkAncestors(context.base, context.directory);
  const stat = existing(context.directory);
  if (stat && (stat.isSymbolicLink() || !stat.isDirectory())) error('STATE_FILE_TYPE', 'Invocation directory is not a regular directory');
}
function ensureDirectory(directory) {
  try { if (fs.lstatSync(directory).isSymbolicLink()) error('STATE_FILE_TYPE', 'Symlinked directory is not allowed'); } catch (cause) { if (cause.code !== 'ENOENT') throw cause; }
  fs.mkdirSync(directory, { recursive: true });
  if (fs.lstatSync(directory).isSymbolicLink()) error('STATE_FILE_TYPE', 'Symlinked directory is not allowed');
  secureStat(directory, 'directory');
}
function reportPath(value) {
  if (typeof value !== 'string' || !value || value.length > 400 || value.includes('\0') || path.posix.isAbsolute(value) || value.includes('\\')) error('INVALID_REPORT_PATH', 'Report path must be repository-relative');
  const parts = value.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..') || path.posix.normalize(value) !== value) error('INVALID_REPORT_PATH', 'Report path traversal is not allowed');
  return value;
}
function adviceReportPath(value, invocationId) {
  const relative = reportPath(value);
  const directory = path.posix.dirname(relative);
  if (directory !== 'plans/reports' && !/^plans\/[A-Za-z0-9][A-Za-z0-9._-]*\/reports$/.test(directory)) error('INVALID_REPORT_PATH', 'Advice reports must be under plans reports directories');
  const filename = path.posix.basename(relative);
  if (!/^advise-\d{8}-\d{4}-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.md$/i.test(filename)) error('INVALID_REPORT_PATH', 'Advice report filename is invalid');
  if (invocationId !== undefined && (!UUID.test(invocationId) || !filename.endsWith(`-${invocationId}.md`))) error('INVALID_REPORT_PATH', 'Advice report is not bound to this invocation');
  return relative;
}
function validateState(state, context) {
  if (!state || typeof state !== 'object' || Array.isArray(state) || state.schema !== 'evcrate-advise-state/v1') error('STATE_SCHEMA', 'Invalid state schema');
  if (Object.keys(state).length !== KEYS.size || [...KEYS].some((key) => !Object.hasOwn(state, key)) || [...Object.keys(state)].some((key) => !KEYS.has(key)) || state.version !== 1 || state.projectKey !== context.key || !UUID.test(state.invocationId) || state.invocationId !== context.id) error('STATE_SCHEMA', 'Unexpected or mismatched state fields');
  if (!PHASES.has(state.phase) || !STATES.has(state.status) || state.status === 'active' && state.phase === 'failed' || state.status !== 'active' && state.phase !== 'failed' || typeof state.originalInput !== 'string' || !Array.isArray(state.questions) || state.questions.length > 10 || (state.reframe !== null && typeof state.reframe !== 'string') || (state.reportPath !== null && typeof state.reportPath !== 'string') || (state.lastFailureCode !== null && typeof state.lastFailureCode !== 'string') || state.status === 'active' && state.lastFailureCode !== null || state.status !== 'active' && !state.lastFailureCode) error('STATE_SCHEMA', 'Invalid state values');
  for (const field of ['createdAt', 'updatedAt']) { if (!Number.isFinite(Date.parse(state[field]))) error('STATE_SCHEMA', `Invalid ${field}`); }
  const now = context.now === undefined ? Date.now() : Number(context.now);
  if (!Number.isFinite(now) || Date.parse(state.updatedAt) < Date.parse(state.createdAt) || Date.parse(state.updatedAt) > now + 300000) error('STATE_SCHEMA', 'Invalid state timestamps');
  if (!context.allowExpired && ['paused', 'failed'].includes(state.status) && now - Date.parse(state.updatedAt) > FAILURE_RETENTION_MS) error('STATE_STALE', 'State retention window expired');
  if (state.reportPath !== null) adviceReportPath(state.reportPath, context.id);
  const pending = state.pendingQuestion;
  if (pending !== null && (!pending || Object.keys(pending).length !== PENDING_KEYS.size || [...PENDING_KEYS].some((key) => !Object.hasOwn(pending, key)) || [...Object.keys(pending)].some((key) => !PENDING_KEYS.has(key)) || !TYPES.has(pending.type) || typeof pending.id !== 'string' || !pending.id.trim() || bytes(pending.id) > 80 || typeof pending.text !== 'string' || !pending.text.trim() || bytes(pending.text) > 1000 || pending.type !== state.phase)) error('STATE_SCHEMA', 'Invalid pending question');
  const ids = new Set();
  for (const question of state.questions) {
    const askedAt = question && Date.parse(question.askedAt); const answeredAt = question && question.answeredAt === null ? null : question && Date.parse(question.answeredAt);
    if (!question || Object.keys(question).length !== QUESTION_KEYS.size || [...QUESTION_KEYS].some((key) => !Object.hasOwn(question, key)) || [...Object.keys(question)].some((key) => !QUESTION_KEYS.has(key)) || ids.has(question.id) || !TYPES.has(question.type) || typeof question.id !== 'string' || !question.id.trim() || bytes(question.id) > 80 || typeof question.text !== 'string' || !question.text.trim() || bytes(question.text) > 1000 || (question.answer !== null && typeof question.answer !== 'string') || !Number.isFinite(askedAt) || question.answeredAt !== null && !Number.isFinite(answeredAt) || question.answer === null && question.answeredAt !== null || question.answer !== null && question.answeredAt === null || question.answeredAt !== null && answeredAt < askedAt) error('STATE_SCHEMA', 'Invalid question entry');
    ids.add(question.id);
  }
  const confirmQuestions = state.questions.filter((question) => question.type === 'confirm_reframe');
  if (state.questions.filter((question) => question.type === 'discovery').length > 8 || confirmQuestions.length > 2 || state.questions.filter((question) => question.answer === null).length > 1 || state.phase === 'confirm_reframe' && confirmQuestions.length === 0 || Boolean(pending) !== state.questions.some((question) => question.id === pending?.id && question.type === pending?.type && question.text === pending?.text && question.answer === null)) error('STATE_SCHEMA', 'Pending question invariant violated');
  if (bytes(JSON.stringify(state)) > MAX_BYTES) error('STATE_TOO_LARGE', 'Serialized state exceeds 64 KiB');
  return state;
}
function parseJsonFile(file, max = MAX_BYTES) { const stat = secureStat(file, 'file'); if (stat.size > max) error('STATE_TOO_LARGE', 'Serialized state exceeds its byte bound'); try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { error('STATE_SCHEMA', 'State is not valid JSON'); } }
function validateTombstone(value, context) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== TOMBSTONE_KEYS.size || [...TOMBSTONE_KEYS].some((key) => !Object.hasOwn(value, key)) || [...Object.keys(value)].some((key) => !TOMBSTONE_KEYS.has(key)) || value.schema !== 'evcrate-advise-tombstone/v1' || value.version !== 1 || value.projectKey !== context.key || value.invocationId !== context.id || !Number.isFinite(Date.parse(value.completedAt)) || typeof value.completedAt !== 'string') error('STATE_SCHEMA', 'Invalid tombstone');
  adviceReportPath(value.reportPath, context.id);
  return value;
}
function readTombstone(context) {
  const stat = existing(context.tombstone);
  if (!stat) return null;
  if (existing(context.state)) error('STATE_SCHEMA', 'Both state and tombstone exist');
  if (stat.isSymbolicLink()) error('STATE_FILE_TYPE', 'Symlinked tombstone is not allowed');
  return validateTombstone(parseJsonFile(context.tombstone), context);
}
function recoverCompletion(context) {
  const stat = existing(context.state);
  if (!stat) return null;
  if (existing(context.tombstone)) error('STATE_SCHEMA', 'Both state and tombstone exist');
  if (stat.isSymbolicLink()) error('STATE_FILE_TYPE', 'Symlinked state file is not allowed');
  const value = parseJsonFile(context.state);
  if (value?.schema !== 'evcrate-advise-tombstone/v1') return null;
  const tombstone = validateTombstone(value, context);
  fs.renameSync(context.state, context.tombstone);
  return tombstone;
}
function stamp(options) { return new Date(options.now === undefined ? Date.now() : options.now).toISOString(); }
function writeAtomic(file, value, options = {}) {
  const encoded = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  if (bytes(encoded) > MAX_BYTES) error('STATE_TOO_LARGE', 'Serialized state exceeds 64 KiB');
  const temporary = `${file}.tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
  let fd;
  try { const existing = fs.lstatSync(file); if (existing.isSymbolicLink()) error('STATE_FILE_TYPE', 'Symlinked state file is not allowed'); } catch (cause) { if (cause.code !== 'ENOENT') throw cause; }
  try { fd = fs.openSync(temporary, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY); fs.writeFileSync(fd, encoded); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined; if (options.exclusive) { fs.linkSync(temporary, file); fs.unlinkSync(temporary); } else fs.renameSync(temporary, file);  } catch (cause) { if (fd !== undefined) fs.closeSync(fd); try { fs.unlinkSync(temporary); } catch {} throw cause; }
}
function readState(options) {
  const context = invocationPath(options, options.invocationId); context.id = options.invocationId; context.now = options.now; context.allowExpired = options.allowExpired; secureStat(context.directory, 'directory');
  const stateFile = existing(context.state); const tombstoneFile = existing(context.tombstone);
  if (stateFile && tombstoneFile) error('STATE_SCHEMA', 'Both state and tombstone exist');
  if (tombstoneFile) { readTombstone(context); error('STATE_COMPLETED', 'Invocation has already completed'); }
  if (recoverCompletion(context)) error('STATE_COMPLETED', 'Invocation has already completed');
  return validateState(parseJsonFile(context.state), context);
}
function save(context, state, options = {}, writeOptions = {}) { state.updatedAt = stamp(options); context.now = options.now; validateState(state, context); writeAtomic(context.state, state, writeOptions); secureStat(context.state, 'file'); return state; }
function init(options) {
  ensureRuntimeTree(options); const id = options.invocationId || crypto.randomUUID(); const context = invocationPath(options, id); context.id = id; ensureDirectory(context.directory);
  for (const file of [context.state, context.tombstone]) if (existing(file)) error('STATE_EXISTS', 'Invocation already exists');
  const now = stamp(options); const state = { schema: 'evcrate-advise-state/v1', version: 1, projectKey: context.key, invocationId: id, createdAt: now, updatedAt: now, phase: 'discovery', status: 'active', originalInput: bounded(options.input), questions: [], reframe: null, pendingQuestion: null, reportPath: null, lastFailureCode: null };
  try { return save(context, state, options, { exclusive: true }); } catch (cause) { if (cause.code === 'EEXIST') error('STATE_EXISTS', 'Invocation already exists'); throw cause; }
}
function processAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try { process.kill(pid, 0); return true; } catch (cause) { return cause.code !== 'ESRCH'; }
}
function staleLock(lock, now = Date.now()) {
  let stat;
  try { stat = secureStat(lock, 'file'); } catch { return false; }
  if (now - stat.mtimeMs <= LOCK_STALE_MS) return false;
  let metadata;
  try { if (stat.size > 1024) return false; metadata = JSON.parse(fs.readFileSync(lock, 'utf8')); } catch { return false; }
  if (!metadata || typeof metadata !== 'object' || !Number.isSafeInteger(metadata.pid)) return false;
  return !processAlive(metadata.pid);
}
function withLock(context, callback) {
  let fd; let acquired = false;
  try {
    validateInvocationDirectory(context);
    for (;;) {
      try {
        const noFollow = fs.constants.O_NOFOLLOW || 0;
        fd = fs.openSync(context.lock, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | noFollow);
        acquired = true;
        fs.writeSync(fd, JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
        fs.fsyncSync(fd);
        validateInvocationDirectory(context);
        break;
      } catch (cause) {
        if (cause.code !== 'EEXIST') throw cause;
        if (!staleLock(context.lock)) error('STATE_BUSY', 'Invocation is being updated');
        try { fs.unlinkSync(context.lock); } catch (unlinkCause) { if (unlinkCause.code !== 'ENOENT') throw unlinkCause; }
      }
    }
    return callback();
  } finally {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch {} }
    if (acquired) { try { fs.unlinkSync(context.lock); } catch {} }
  }
}
function mutate(options, callback) { const context = invocationPath(options, options.invocationId); context.id = options.invocationId; return withLock(context, () => { const state = readState(options); callback(state); return save(context, state, options); }); }
function ask(options) { return mutate(options, (state) => { if (state.status !== 'active') error('STATE_TRANSITION', 'Inactive invocation cannot ask'); if (state.pendingQuestion) error('QUESTION_PENDING', 'A question is already pending'); if (!TYPES.has(options.type) || typeof options.questionId !== 'string' || !options.questionId.trim() || bytes(options.questionId) > 80 || typeof options.text !== 'string' || !options.text.trim()) error('INVALID_QUESTION', 'Question requires id, type, and text'); if (state.questions.some((question) => question.id === options.questionId)) error('QUESTION_REPLAY', 'Question ID already exists'); const count = state.questions.filter((question) => question.type === options.type).length; if ((options.type === 'discovery' && count >= 8) || (options.type === 'confirm_reframe' && count >= 2)) error('QUESTION_CAP', 'Interview question cap reached'); if (options.type === 'confirm_reframe' && (state.phase !== 'discovery' || !state.questions.some((question) => question.type === 'discovery' && question.answer !== null) || typeof options.reframe !== 'string' || !options.reframe.trim())) error('STATE_TRANSITION', 'Reframe confirmation requires completed discovery and a reframe'); state.phase = options.type; state.questions.push({ id: bounded(options.questionId, 80), type: options.type, text: bounded(options.text, 1000), answer: null, askedAt: stamp(options), answeredAt: null }); state.pendingQuestion = { id: bounded(options.questionId, 80), type: options.type, text: bounded(options.text, 1000) }; if (options.reframe !== undefined) state.reframe = options.reframe === null ? null : bounded(options.reframe); }); }
function answer(options) { return mutate(options, (state) => { if (state.status !== 'active') error('STATE_TRANSITION', 'Inactive invocation cannot answer'); const pending = state.pendingQuestion; if (!pending || typeof options.questionId !== 'string' || pending.id !== options.questionId) error('ANSWER_REPLAY', 'Answer does not match the pending question'); if (typeof options.answer !== 'string' || !options.answer.trim()) error('INVALID_ANSWER', 'Answer must contain text'); const entry = state.questions.find((question) => question.id === pending.id); if (!entry || entry.answer !== null) error('ANSWER_REPLAY', 'Question was already answered'); const nextReframe = options.reframe === undefined ? state.reframe : options.reframe; if (pending.type === 'discovery' && options.phase !== undefined && options.phase !== 'discovery' || pending.type === 'confirm_reframe' && options.phase === undefined || pending.type === 'confirm_reframe' && !['discovery', 'confirm_reframe'].includes(options.phase) || options.phase === 'confirm_reframe' && (typeof nextReframe !== 'string' || !nextReframe.trim())) error('STATE_TRANSITION', 'Invalid interview transition'); const nextPhase = pending.type === 'discovery' ? 'discovery' : options.phase; entry.answer = bounded(options.answer); entry.answeredAt = stamp(options); state.pendingQuestion = null; state.phase = nextPhase; if (options.reframe !== undefined) state.reframe = options.reframe === null ? null : bounded(options.reframe); }); }
function fail(options) { return mutate(options, (state) => { state.status = options.status === 'paused' ? 'paused' : 'failed'; state.phase = 'failed'; state.lastFailureCode = bounded(options.code || 'RELAY_FAILED', 120); state.pendingQuestion = null; }); }
function complete(options) { const context = invocationPath(options, options.invocationId); context.id = options.invocationId; return withLock(context, () => { if (readTombstone(context)) error('STATE_COMPLETED', 'Invocation has already completed'); const state = readState(options); if (state.status !== 'active' || state.phase !== 'confirm_reframe' || typeof state.reframe !== 'string' || !state.reframe.trim() || !state.questions.some((question) => question.type === 'confirm_reframe' && question.answer !== null)) error('STATE_TRANSITION', 'Advice is not ready for completion'); if (state.pendingQuestion) error('QUESTION_PENDING', 'Cannot complete with a pending question'); const pathValue = adviceReportPath(options.reportPath, context.id); validateReport({ ...options, reportPath: pathValue }); const tombstone = { schema: 'evcrate-advise-tombstone/v1', version: 1, projectKey: context.key, invocationId: context.id, completedAt: stamp(options), reportPath: pathValue }; writeAtomic(context.state, tombstone); fs.renameSync(context.state, context.tombstone); secureStat(context.tombstone, 'file'); return tombstone; }); }
function cleanup(options) { let paths; try { paths = runtimePaths(options); } catch (cause) { if (cause.code === 'STATE_MISSING') return 0; throw cause; } const keyRoot = paths.keyRoot; const keyStat = existing(keyRoot); if (!keyStat) return 0; secureStat(keyRoot, 'directory'); const now = Number(options.now === undefined ? Date.now() : options.now); let removed = 0; for (const entry of fs.readdirSync(keyRoot)) { if (!UUID.test(entry)) continue; const context = invocationPath(options, entry); context.id = entry; const stat = existing(context.directory); if (!stat || stat.isSymbolicLink() || !stat.isDirectory()) continue; secureStat(context.directory, 'directory'); try { const tombstone = readTombstone(context); if (tombstone) { if (now - Date.parse(tombstone.completedAt) > TOMBSTONE_RETENTION_MS) { fs.rmSync(context.directory, { recursive: true, force: false }); removed++; } continue; } const current = readState({ ...options, invocationId: entry, allowExpired: true }); if (['paused', 'failed'].includes(current.status) && now - Date.parse(current.updatedAt) > FAILURE_RETENTION_MS) { fs.rmSync(context.directory, { recursive: true, force: false }); removed++; } } catch {} } return removed; }
function parseArguments(raw) { if (typeof raw !== 'string') error('INVALID_ARGUMENTS', 'Raw arguments must be a string'); const matches = [...raw.matchAll(/(^|\s)--agent(?=\s|$)/g)]; if (matches.length > 1) error('DUPLICATE_AGENT', 'Duplicate standalone --agent flags are not allowed'); if (!matches.length) return { mode: 'inline', workArguments: raw }; const match = matches[0]; const end = match.index + match[0].length; if (!/^\s*$/.test(raw.slice(end))) return { mode: 'inline', workArguments: raw }; return { mode: 'relay', workArguments: raw.slice(0, match.index).replace(/\s+$/, '') }; }
function validateEnvelope(options) {
  const context = invocationPath(options, options.invocationId); context.id = options.invocationId;
  let envelope = options.envelope;
  if (typeof envelope === 'string') { if (Buffer.byteLength(envelope, 'utf8') > 8192) error('ENVELOPE_INVALID', 'Envelope exceeds its byte bound'); try { envelope = JSON.parse(envelope); } catch { error('ENVELOPE_INVALID', 'Envelope is not valid JSON'); } }
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope) || envelope.protocol !== 'evcrate-advise-relay' || envelope.version !== 1 || envelope.invocationId !== context.id) error('ENVELOPE_INVALID', 'Envelope protocol or invocation does not match');
  const state = readState(options);
  if (envelope.status === 'NEEDS_USER_INPUT') {
    const question = envelope.question;
    const shapeValid = Object.keys(envelope).length === 6 && ['protocol', 'version', 'status', 'invocationId', 'statePath', 'question'].every((key) => Object.hasOwn(envelope, key)) && envelope.statePath === context.state && question && typeof question === 'object' && !Array.isArray(question) && Object.keys(question).length === 3 && ['id', 'type', 'text'].every((key) => Object.hasOwn(question, key)) && TYPES.has(question.type) && typeof question.id === 'string' && question.id.trim() && bytes(question.id) <= 80 && typeof question.text === 'string' && question.text.trim() && bytes(question.text) <= 1000 && !hasUnredactedCredential(question.text);
    const pendingMatches = state.pendingQuestion && shapeValid && question.id === state.pendingQuestion.id && question.type === state.pendingQuestion.type && question.text === state.pendingQuestion.text;
    const unansweredDiscovery = state.questions.some((entry) => entry.type === 'discovery' && entry.answer !== null);
    const canPersist = shapeValid && !state.pendingQuestion && !state.questions.some((entry) => entry.id === question.id) && ((question.type === 'discovery' && state.phase === 'discovery' && state.questions.filter((entry) => entry.type === 'discovery').length < 8) || (question.type === 'confirm_reframe' && state.phase === 'discovery' && unansweredDiscovery && state.questions.filter((entry) => entry.type === 'confirm_reframe').length < 2));
    if (!pendingMatches && !canPersist) error('ENVELOPE_INVALID', 'Invalid NEEDS_USER_INPUT envelope');
    return envelope;
  }
  if (envelope.status === 'ADVICE_READY') {
    if (Object.keys(envelope).length !== 6 || !['protocol', 'version', 'status', 'invocationId', 'reportPath', 'summary'].every((key) => Object.hasOwn(envelope, key)) || state.phase !== 'confirm_reframe' || typeof state.reframe !== 'string' || !state.reframe.trim() || !state.questions.some((question) => question.type === 'confirm_reframe' && question.answer !== null) || state.pendingQuestion || typeof envelope.summary !== 'string' || !envelope.summary.trim() || bytes(envelope.summary) > 2000 || hasUnredactedCredential(envelope.summary)) error('ENVELOPE_INVALID', 'Invalid ADVICE_READY envelope');
    adviceReportPath(envelope.reportPath, context.id);
    return envelope;
  }
  error('ENVELOPE_INVALID', 'Unsupported relay status');
}
function hasUnredactedCredential(content) {
  if (/-----BEGIN [^-]+ PRIVATE KEY-----/i.test(content) || /\bBearer\s+(?!\[REDACTED(?:_[A-Z_]+)?\])\S+/i.test(content)) return true;
  for (const match of content.matchAll(CREDENTIAL_VALUE)) {
    const value = match[1] ?? match[2] ?? match[3] ?? '';
    if (!REDACTED_VALUE.test(value) && !/^Bearer\s+\[REDACTED(?:_[A-Z_]+)?\]$/i.test(value)) return true;
  }
  return false;
}
function validateReportContent(content) {
  if (typeof content !== 'string' || bytes(content) > REPORT_MAX_BYTES) error('REPORT_INVALID', 'Report content is missing or oversized');
  const seen = [];
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
    if (!match) continue;
    const title = match[1].trim();
    if (title !== 'Advice' && !REQUIRED_REPORT_HEADINGS.includes(title)) error('REPORT_INVALID', 'Report schema or privacy validation failed');
    if (title !== 'Advice') seen.push(title);
  }
  if (seen.length !== REQUIRED_REPORT_HEADINGS.length || new Set(seen).size !== seen.length || REQUIRED_REPORT_HEADINGS.some((heading) => !seen.includes(heading)) || hasUnredactedCredential(content)) error('REPORT_INVALID', 'Report schema or privacy validation failed');
  return content;
}
function reportTarget(options) { const root = projectRoot(options.projectRoot); const relative = adviceReportPath(options.reportPath, options.invocationId); const target = path.resolve(root, relative); if (!within(root, target)) error('REPORT_CONTAINMENT', 'Report path escapes project root'); rejectSymlinkAncestors(root, target); return { root, relative, target }; }
function validateReport(options) { const target = reportTarget(options); let stat; try { stat = fs.lstatSync(target.target); } catch { error('REPORT_INVALID', 'Report file is missing'); } if (stat.isSymbolicLink() || !stat.isFile() || stat.size > REPORT_MAX_BYTES) error('REPORT_INVALID', 'Report file is unsafe or oversized'); const content = fs.readFileSync(target.target, 'utf8'); validateReportContent(content); return { reportPath: target.relative, bytes: Buffer.byteLength(content, 'utf8') }; }
function writeReport(options) { const target = reportTarget(options); if (typeof options.content !== 'string') error('REPORT_INVALID', 'Report content must be text'); const content = bounded(options.content, REPORT_MAX_BYTES - 1); validateReportContent(content); if (existing(target.target)) error('REPORT_EXISTS', 'Advice report already exists'); rejectSymlinkAncestors(target.root, target.target); fs.mkdirSync(path.dirname(target.target), { recursive: true }); rejectSymlinkAncestors(target.root, target.target); writeAtomic(target.target, content); secureStat(target.target, 'file'); return validateReport({ ...options, reportPath: target.relative }); }
function operation(options) { if (options.operation !== 'parse' && options.operation !== 'validate-envelope' && options.operation !== 'validate-report' && options.operation !== 'write-report') cleanup(options); switch (options.operation) { case 'init': return init(options); case 'read': return readState(options); case 'ask': return ask(options); case 'answer': return answer(options); case 'pause': return fail({ ...options, status: 'paused' }); case 'fail': return fail(options); case 'complete': return complete(options); case 'cleanup': return cleanup(options); case 'parse': return parseArguments(options.raw); case 'validate-envelope': return validateEnvelope(options); case 'validate-report': return validateReport(options); case 'write-report': return writeReport(options); default: error('INVALID_OPERATION', 'Unknown advise-state operation'); } }

module.exports = { MAX_BYTES, FAILURE_RETENTION_MS, TOMBSTONE_RETENTION_MS, LOCK_STALE_MS, REPORT_MAX_BYTES, REQUIRED_REPORT_HEADINGS, bounded, projectKey, reportPath, adviceReportPath, parseArguments, validateEnvelope, validateReport, writeReport, init, readState, ask, answer, fail, complete, cleanup, operation };
if (require.main === module) { try { process.stdout.write(`${JSON.stringify(operation(JSON.parse(process.argv[2] || '{}')))}\n`); } catch (cause) { process.stderr.write(`${cause.code || 'ADVISE_STATE_ERROR'}: ${cause.message}\n`); process.exitCode = 1; } }
