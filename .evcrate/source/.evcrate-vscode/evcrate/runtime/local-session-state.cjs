'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { computeProjectKey } = require('./local-session-context.cjs');

const MAX_RECORD_BYTES = 16384;
const MAX_PROJECT_RECORDS = 256;
const MAX_USER_RECORDS = 1024;
const EXPIRY_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

class SessionStateError extends Error {
  constructor(code, message) {
    super('[evcrate-session-state] ' + code + ': ' + message);
    this.name = 'SessionStateError';
    this.code = code;
  }
}

function ensureSecureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

function canonicalPath(p) {
  try {
    return fs.realpathSync(path.resolve(p));
  } catch {
    return path.resolve(p);
  }
}

function withFileLock(lockPath, fn, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  let acquired = false;

  while (Date.now() <= deadline) {
    try {
      ensureSecureDir(path.dirname(lockPath));
      const fd = fs.openSync(lockPath, 'wx', 0o600);
      fs.closeSync(fd);
      acquired = true;
      break;
    } catch (err) {
      if (err && err.code === 'EEXIST') {
        try {
          const stat = fs.statSync(lockPath);
          if (Date.now() - stat.mtimeMs > 5000) {
            fs.unlinkSync(lockPath);
            continue;
          }
        } catch {}
      }
      const pause = Date.now() + 10;
      while (Date.now() < pause) {}
    }
  }

  if (!acquired) {
    throw new SessionStateError('SESSION_CONTEXT_UNAVAILABLE', 'Could not acquire lock: ' + lockPath);
  }

  try {
    return fn();
  } finally {
    try {
      if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
    } catch {}
  }
}

function writeRecordAtomic(handle, record) {
  ensureSecureDir(path.dirname(handle));
  const raw = JSON.stringify(record, null, 2) + '\n';
  const byteLen = Buffer.byteLength(raw, 'utf8');
  if (byteLen > MAX_RECORD_BYTES) {
    throw new SessionStateError('SESSION_CONTEXT_INVALID', 'Record exceeds ' + MAX_RECORD_BYTES + ' bytes');
  }
  const tmpPath = handle + '.' + process.pid + '.' + Date.now() + '.tmp';
  fs.writeFileSync(tmpPath, raw, { mode: 0o600, encoding: 'utf8' });
  fs.renameSync(tmpPath, handle);
}

function sweepExpiredSessions(userDir, maxCandidates = 64, now = Date.now()) {
  if (!fs.existsSync(userDir)) return 0;
  let deletedCount = 0;
  let examined = 0;

  try {
    const projectDirs = fs.readdirSync(userDir, { withFileTypes: true });
    for (const pDir of projectDirs) {
      if (!pDir.isDirectory() || pDir.name.endsWith('.lock')) continue;
      const pPath = path.join(userDir, pDir.name);
      const files = fs.readdirSync(pPath, { withFileTypes: true });

      for (const file of files) {
        if (!file.isFile() || !file.name.endsWith('.json') || file.name.endsWith('.tmp')) continue;
        if (examined >= maxCandidates) return deletedCount;
        examined++;

        const filePath = path.join(pPath, file.name);
        const lockPath = filePath + '.lock';
        try {
          withFileLock(lockPath, () => {
            const stat = fs.statSync(filePath);
            if (stat.size > MAX_RECORD_BYTES) return;
            const text = fs.readFileSync(filePath, 'utf8');
            const data = JSON.parse(text);
            if (data.version === 1 && data.target === 'vscode' && typeof data.lastSeenAt === 'number') {
              if (now - data.lastSeenAt > EXPIRY_DURATION_MS) {
                fs.unlinkSync(filePath);
                deletedCount++;
              }
            }
          }, 50);
        } catch {}
      }
    }
  } catch {}

  return deletedCount;
}

function countUserSessions(userDir) {
  const result = { total: 0, byProject: {} };
  if (!fs.existsSync(userDir)) return result;

  try {
    const projectDirs = fs.readdirSync(userDir, { withFileTypes: true });
    for (const pDir of projectDirs) {
      if (!pDir.isDirectory() || pDir.name.endsWith('.lock')) continue;
      const pPath = path.join(userDir, pDir.name);
      let pCount = 0;
      const files = fs.readdirSync(pPath, { withFileTypes: true });
      for (const file of files) {
        if (file.isFile() && file.name.endsWith('.json') && !file.name.endsWith('.tmp')) {
          pCount++;
          result.total++;
        }
      }
      result.byProject[pDir.name] = pCount;
    }
  } catch {}

  return result;
}

function normalizePlanPath(planPath, expectedProject) {
  if (!planPath || typeof planPath !== 'string' || planPath.trim().length === 0) {
    throw new SessionStateError('PLAN_PATH_UNSAFE', 'Plan path is empty');
  }
  if (planPath.includes('\0')) {
    throw new SessionStateError('PLAN_PATH_UNSAFE', 'Plan path contains null bytes');
  }

  const canonicalProj = canonicalPath(expectedProject);
  const resolved = path.isAbsolute(planPath)
    ? path.resolve(planPath)
    : path.resolve(canonicalProj, planPath);

  const canonicalResolved = canonicalPath(resolved);
  if (!canonicalResolved.startsWith(canonicalProj + path.sep) && canonicalResolved !== canonicalProj) {
    throw new SessionStateError('PLAN_PATH_UNSAFE', 'Plan path escapes project root: ' + planPath);
  }

  if (!fs.existsSync(canonicalResolved)) {
    throw new SessionStateError('PLAN_PATH_UNSAFE', 'Plan file or directory does not exist: ' + planPath);
  }

  const rel = path.relative(canonicalProj, canonicalResolved);
  return rel.split(path.sep).join('/');
}

function initSessionState(context, initialPlan, now = Date.now()) {
  const handle = context.handle;
  const lockPath = handle + '.lock';
  const userDir = path.dirname(path.dirname(handle));
  const userLockPath = path.join(userDir, 'user.lock');

  return withFileLock(userLockPath, () => {
    return withFileLock(lockPath, () => {
      if (fs.existsSync(handle)) {
        const text = fs.readFileSync(handle, 'utf8');
        try {
          const existing = JSON.parse(text);
          if (existing.version === 1 && existing.target === 'vscode' && (now - existing.lastSeenAt <= EXPIRY_DURATION_MS)) {
            const refreshed = Object.assign({}, existing, { lastSeenAt: now });
            writeRecordAtomic(handle, refreshed);
            return refreshed;
          }
        } catch {}
      }

      const counts = countUserSessions(userDir);
      const projectCount = counts.byProject[context.projectKey] || 0;
      if (projectCount >= MAX_PROJECT_RECORDS || counts.total >= MAX_USER_RECORDS) {
        sweepExpiredSessions(userDir, 64, now);
        const recounts = countUserSessions(userDir);
        const reProjectCount = recounts.byProject[context.projectKey] || 0;
        if (reProjectCount >= MAX_PROJECT_RECORDS || recounts.total >= MAX_USER_RECORDS) {
          throw new SessionStateError(
            'SESSION_STATE_CAPACITY',
            'Session capacity exceeded (project: ' + reProjectCount + '/' + MAX_PROJECT_RECORDS + ', user: ' + recounts.total + '/' + MAX_USER_RECORDS + ')'
          );
        }
      }

      const activePlan = initialPlan ? normalizePlanPath(initialPlan, context.projectRoot) : null;
      const record = {
        version: 1,
        target: 'vscode',
        projectRoot: context.projectRoot,
        projectKey: context.projectKey,
        sessionKey: context.sessionKey,
        revision: 1,
        activePlan,
        lastSeenAt: now,
        compact: null
      };

      writeRecordAtomic(handle, record);
      return record;
    });
  });
}

function readSessionContext(handle, expectedProject, now = Date.now()) {
  if (!fs.existsSync(handle)) {
    return {
      status: 'error',
      code: 'SESSION_CONTEXT_UNAVAILABLE',
      message: 'Session handle file does not exist: ' + handle
    };
  }

  let text;
  try {
    const stat = fs.statSync(handle);
    if (!stat.isFile() || stat.size > MAX_RECORD_BYTES) {
      return {
        status: 'error',
        code: 'SESSION_CONTEXT_INVALID',
        message: 'Handle is not a regular file or exceeds 16 KiB limit'
      };
    }
    text = fs.readFileSync(handle, 'utf8');
  } catch (err) {
    return {
      status: 'error',
      code: 'SESSION_CONTEXT_UNAVAILABLE',
      message: 'Failed to read handle: ' + String(err)
    };
  }

  let record;
  try {
    record = JSON.parse(text);
  } catch {
    return {
      status: 'error',
      code: 'SESSION_CONTEXT_INVALID',
      message: 'Handle content is not valid JSON'
    };
  }

  if (!record || record.version !== 1 || record.target !== 'vscode' || typeof record.revision !== 'number') {
    return {
      status: 'error',
      code: 'SESSION_CONTEXT_INVALID',
      message: 'Handle content has invalid schema or target'
    };
  }

  const canonicalExpected = canonicalPath(expectedProject);
  const expectedKey = computeProjectKey(canonicalExpected);
  if (record.projectKey !== expectedKey || canonicalPath(record.projectRoot) !== canonicalExpected) {
    return {
      status: 'error',
      code: 'SESSION_CONTEXT_PROJECT_MISMATCH',
      message: 'Project mismatch: expected ' + canonicalExpected + ' (' + expectedKey + '), record has ' + record.projectRoot + ' (' + record.projectKey + ')'
    };
  }

  if (now - record.lastSeenAt > EXPIRY_DURATION_MS) {
    return {
      status: 'error',
      code: 'SESSION_CONTEXT_EXPIRED',
      message: 'Session has expired (last seen ' + new Date(record.lastSeenAt).toISOString() + ')'
    };
  }

  return {
    status: 'ok',
    record,
    rawBytes: text
  };
}

function setActivePlan(handle, expectedProject, planPath, expectedRevision, now = Date.now()) {
  const normalizedPlan = normalizePlanPath(planPath, expectedProject);
  const lockPath = handle + '.lock';

  return withFileLock(lockPath, () => {
    const current = readSessionContext(handle, expectedProject, now);
    if (current.status === 'error') {
      throw new SessionStateError(current.code, current.message);
    }

    if (current.record.revision !== expectedRevision) {
      throw new SessionStateError(
        'SESSION_CONTEXT_REVISION_CONFLICT',
        'Revision conflict: expected ' + expectedRevision + ', current is ' + current.record.revision
      );
    }

    const updated = Object.assign({}, current.record, {
      revision: current.record.revision + 1,
      activePlan: normalizedPlan,
      lastSeenAt: now
    });

    writeRecordAtomic(handle, updated);
    return updated;
  });
}

function clearActivePlan(handle, expectedProject, expectedRevision, now = Date.now()) {
  const lockPath = handle + '.lock';

  return withFileLock(lockPath, () => {
    const current = readSessionContext(handle, expectedProject, now);
    if (current.status === 'error') {
      throw new SessionStateError(current.code, current.message);
    }

    if (current.record.revision !== expectedRevision) {
      throw new SessionStateError(
        'SESSION_CONTEXT_REVISION_CONFLICT',
        'Revision conflict: expected ' + expectedRevision + ', current is ' + current.record.revision
      );
    }

    const updated = Object.assign({}, current.record, {
      revision: current.record.revision + 1,
      activePlan: null,
      lastSeenAt: now
    });

    writeRecordAtomic(handle, updated);
    return updated;
  });
}

function refreshSession(handle, expectedProject, now = Date.now()) {
  const lockPath = handle + '.lock';

  return withFileLock(lockPath, () => {
    const current = readSessionContext(handle, expectedProject, now);
    if (current.status === 'error') {
      throw new SessionStateError(current.code, current.message);
    }

    const updated = Object.assign({}, current.record, {
      lastSeenAt: now
    });

    writeRecordAtomic(handle, updated);
    return updated;
  });
}

function recordPreCompactState(handle, expectedProject, now = Date.now()) {
  const lockPath = handle + '.lock';

  return withFileLock(lockPath, () => {
    const current = readSessionContext(handle, expectedProject, now);
    if (current.status === 'error') {
      throw new SessionStateError(current.code, current.message);
    }

    const seq = (current.record.compact && current.record.compact.sequence ? current.record.compact.sequence : 0) + 1;
    const updated = Object.assign({}, current.record, {
      lastSeenAt: now,
      compact: {
        sequence: seq,
        lastObservedAt: now
      }
    });

    writeRecordAtomic(handle, updated);
    return updated;
  });
}

function forgetSession(handle, expectedProject, expectedRevision, now = Date.now()) {
  const lockPath = handle + '.lock';

  withFileLock(lockPath, () => {
    const current = readSessionContext(handle, expectedProject, now);
    if (current.status === 'error') {
      if (current.code === 'SESSION_CONTEXT_EXPIRED' && fs.existsSync(handle)) {
        try {
          const raw = JSON.parse(fs.readFileSync(handle, 'utf8'));
          if (raw && raw.version === 1 && raw.target === 'vscode') {
            if (expectedRevision != null && raw.revision !== expectedRevision) {
              throw new SessionStateError(
                'SESSION_CONTEXT_REVISION_CONFLICT',
                'Revision conflict: expected ' + expectedRevision + ', current is ' + raw.revision
              );
            }
            fs.unlinkSync(handle);
            return;
          }
        } catch (err) {
          if (err instanceof SessionStateError) throw err;
        }
      }
      throw new SessionStateError(current.code, current.message);
    }

    if (expectedRevision != null && current.record.revision !== expectedRevision) {
      throw new SessionStateError(
        'SESSION_CONTEXT_REVISION_CONFLICT',
        'Revision conflict: expected ' + expectedRevision + ', current is ' + current.record.revision
      );
    }

    if (fs.existsSync(handle)) {
      fs.unlinkSync(handle);
    }
  });
}

module.exports = {
  MAX_RECORD_BYTES,
  MAX_PROJECT_RECORDS,
  MAX_USER_RECORDS,
  EXPIRY_DURATION_MS,
  SessionStateError,
  ensureSecureDir,
  withFileLock,
  writeRecordAtomic,
  sweepExpiredSessions,
  countUserSessions,
  normalizePlanPath,
  initSessionState,
  readSessionContext,
  setActivePlan,
  clearActivePlan,
  refreshSession,
  recordPreCompactState,
  recordPreCompact: recordPreCompactState,
  forgetSession
};
