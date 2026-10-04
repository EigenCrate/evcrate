import * as fs from 'node:fs';
import * as path from 'node:path';
import type { NativeSessionContext } from './session-context-types.js';
import { computeProjectKey } from './session-context.js';
import {
  type VscodeSessionStateRecord,
  SessionStateError,
  type ReadSessionResult
} from './session-state-types.js';
import { ensureSecureDir, withFileLock } from './session-state-locks.js';
import {
  MAX_RECORD_BYTES,
  MAX_PROJECT_RECORDS,
  MAX_USER_RECORDS,
  EXPIRY_DURATION_MS,
  isSessionRecord,
  sweepExpiredSessions,
  countUserSessions
} from './session-state-retention.js';

export type { VscodeSessionStateRecord, ReadSessionResult } from './session-state-types.js';
export { SessionStateError } from './session-state-types.js';
export {
  MAX_RECORD_BYTES,
  MAX_PROJECT_RECORDS,
  MAX_USER_RECORDS,
  EXPIRY_DURATION_MS,
  sweepExpiredSessions,
  countUserSessions
} from './session-state-retention.js';

function canonicalPath(p: string): string {
  try {
    return fs.realpathSync(path.resolve(p));
  } catch {
    return path.resolve(p);
  }
}

function writeRecordAtomic(handle: string, record: VscodeSessionStateRecord): void {
  ensureSecureDir(path.dirname(handle));
  const raw = JSON.stringify(record, null, 2) + '\n';
  const byteLen = Buffer.byteLength(raw, 'utf8');
  if (byteLen > MAX_RECORD_BYTES) {
    throw new SessionStateError('SESSION_CONTEXT_INVALID', `Record exceeds ${MAX_RECORD_BYTES} bytes`);
  }
  const tmpPath = `${handle}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, raw, { mode: 0o600, encoding: 'utf8' });
  fs.renameSync(tmpPath, handle);
}

export function normalizePlanPath(planPath: string, expectedProject: string): string {
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
    throw new SessionStateError('PLAN_PATH_UNSAFE', `Plan path escapes project root: ${planPath}`);
  }

  if (!fs.existsSync(canonicalResolved)) {
    throw new SessionStateError('PLAN_PATH_UNSAFE', `Plan file or directory does not exist: ${planPath}`);
  }

  const rel = path.relative(canonicalProj, canonicalResolved);
  return rel.split(path.sep).join('/');
}

export function initSessionState(
  context: NativeSessionContext,
  initialPlan?: string | null,
  now: number = Date.now()
): VscodeSessionStateRecord {
  const handle = context.handle;
  const lockPath = `${handle}.lock`;
  const userDir = path.dirname(path.dirname(handle));
  const userLockPath = path.join(userDir, 'user.lock');

  return withFileLock(userLockPath, () => {
    return withFileLock(lockPath, () => {
      if (fs.existsSync(handle)) {
        const text = fs.readFileSync(handle, 'utf8');
        try {
          const existing: unknown = JSON.parse(text);
          if (isSessionRecord(existing) && (now - existing.lastSeenAt <= EXPIRY_DURATION_MS)) {
            const refreshed: VscodeSessionStateRecord = { ...existing, lastSeenAt: now };
            writeRecordAtomic(handle, refreshed);
            return refreshed;
          }
        } catch {}
      }

      const counts = countUserSessions(userDir);
      const projectCount = counts.byProject[context.projectKey] ?? 0;
      if (projectCount >= MAX_PROJECT_RECORDS || counts.total >= MAX_USER_RECORDS) {
        sweepExpiredSessions(userDir, 64, now);
        const recounts = countUserSessions(userDir);
        const reProjectCount = recounts.byProject[context.projectKey] ?? 0;
        if (reProjectCount >= MAX_PROJECT_RECORDS || recounts.total >= MAX_USER_RECORDS) {
          throw new SessionStateError(
            'SESSION_STATE_CAPACITY',
            `Session capacity exceeded (project: ${reProjectCount}/${MAX_PROJECT_RECORDS}, user: ${recounts.total}/${MAX_USER_RECORDS})`
          );
        }
      }

      const activePlan = initialPlan ? normalizePlanPath(initialPlan, context.projectRoot) : null;
      const record: VscodeSessionStateRecord = {
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

export function readSessionContext(
  handle: string,
  expectedProject: string,
  now: number = Date.now()
): ReadSessionResult {
  if (!fs.existsSync(handle)) {
    return {
      status: 'error',
      code: 'SESSION_CONTEXT_UNAVAILABLE',
      message: `Session handle file does not exist: ${handle}`
    };
  }

  let text: string;
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
  } catch (err: unknown) {
    return {
      status: 'error',
      code: 'SESSION_CONTEXT_UNAVAILABLE',
      message: `Failed to read handle: ${String(err)}`
    };
  }

  let rawData: unknown;
  try {
    rawData = JSON.parse(text);
  } catch {
    return {
      status: 'error',
      code: 'SESSION_CONTEXT_INVALID',
      message: 'Handle content is not valid JSON'
    };
  }

  if (!isSessionRecord(rawData)) {
    return {
      status: 'error',
      code: 'SESSION_CONTEXT_INVALID',
      message: 'Handle content has invalid schema or target'
    };
  }

  const record = rawData;
  const canonicalExpected = canonicalPath(expectedProject);
  const expectedKey = computeProjectKey(canonicalExpected);
  if (record.projectKey !== expectedKey || canonicalPath(record.projectRoot) !== canonicalExpected) {
    return {
      status: 'error',
      code: 'SESSION_CONTEXT_PROJECT_MISMATCH',
      message: `Project mismatch: expected ${canonicalExpected} (${expectedKey}), record has ${record.projectRoot} (${record.projectKey})`
    };
  }

  if (now - record.lastSeenAt > EXPIRY_DURATION_MS) {
    return {
      status: 'error',
      code: 'SESSION_CONTEXT_EXPIRED',
      message: `Session has expired (last seen ${new Date(record.lastSeenAt).toISOString()})`
    };
  }

  return {
    status: 'ok',
    record,
    rawBytes: text
  };
}

export function setActivePlan(
  handle: string,
  expectedProject: string,
  planPath: string,
  expectedRevision: number,
  now: number = Date.now()
): VscodeSessionStateRecord {
  const normalizedPlan = normalizePlanPath(planPath, expectedProject);
  const lockPath = `${handle}.lock`;

  return withFileLock(lockPath, () => {
    const current = readSessionContext(handle, expectedProject, now);
    if (current.status === 'error') {
      throw new SessionStateError(current.code, current.message);
    }

    if (current.record.revision !== expectedRevision) {
      throw new SessionStateError(
        'SESSION_CONTEXT_REVISION_CONFLICT',
        `Revision conflict: expected ${expectedRevision}, current is ${current.record.revision}`
      );
    }

    const updated: VscodeSessionStateRecord = {
      ...current.record,
      revision: current.record.revision + 1,
      activePlan: normalizedPlan,
      lastSeenAt: now
    };

    writeRecordAtomic(handle, updated);
    return updated;
  });
}

export function clearActivePlan(
  handle: string,
  expectedProject: string,
  expectedRevision: number,
  now: number = Date.now()
): VscodeSessionStateRecord {
  const lockPath = `${handle}.lock`;

  return withFileLock(lockPath, () => {
    const current = readSessionContext(handle, expectedProject, now);
    if (current.status === 'error') {
      throw new SessionStateError(current.code, current.message);
    }

    if (current.record.revision !== expectedRevision) {
      throw new SessionStateError(
        'SESSION_CONTEXT_REVISION_CONFLICT',
        `Revision conflict: expected ${expectedRevision}, current is ${current.record.revision}`
      );
    }

    const updated: VscodeSessionStateRecord = {
      ...current.record,
      revision: current.record.revision + 1,
      activePlan: null,
      lastSeenAt: now
    };

    writeRecordAtomic(handle, updated);
    return updated;
  });
}

export function refreshSession(
  handle: string,
  expectedProject: string,
  now: number = Date.now()
): VscodeSessionStateRecord {
  const lockPath = `${handle}.lock`;

  return withFileLock(lockPath, () => {
    const current = readSessionContext(handle, expectedProject, now);
    if (current.status === 'error') {
      throw new SessionStateError(current.code, current.message);
    }

    const updated: VscodeSessionStateRecord = {
      ...current.record,
      lastSeenAt: now
    };

    writeRecordAtomic(handle, updated);
    return updated;
  });
}

export function recordPreCompactState(
  handle: string,
  expectedProject: string,
  now: number = Date.now()
): VscodeSessionStateRecord {
  const lockPath = `${handle}.lock`;

  return withFileLock(lockPath, () => {
    const current = readSessionContext(handle, expectedProject, now);
    if (current.status === 'error') {
      throw new SessionStateError(current.code, current.message);
    }
    const seq = (current.record.compact?.sequence ?? 0) + 1;
    const updated: VscodeSessionStateRecord = {
      ...current.record,
      lastSeenAt: now,
      compact: {
        sequence: seq,
        lastObservedAt: now
      }
    };

    writeRecordAtomic(handle, updated);
    return updated;
  });
}

export function forgetSession(
  handle: string,
  expectedProject: string,
  expectedRevision?: number,
  now: number = Date.now()
): void {
  const lockPath = `${handle}.lock`;

  withFileLock(lockPath, () => {
    const current = readSessionContext(handle, expectedProject, now);
    if (current.status === 'error') {
      if (current.code === 'SESSION_CONTEXT_EXPIRED' && fs.existsSync(handle)) {
        try {
          const raw: unknown = JSON.parse(fs.readFileSync(handle, 'utf8'));
          if (isSessionRecord(raw)) {
            if (expectedRevision != null && raw.revision !== expectedRevision) {
              throw new SessionStateError(
                'SESSION_CONTEXT_REVISION_CONFLICT',
                `Revision conflict: expected ${expectedRevision}, current is ${raw.revision}`
              );
            }
            fs.unlinkSync(handle);
            return;
          }
        } catch (err: unknown) {
          if (err instanceof SessionStateError) throw err;
        }
      }
      throw new SessionStateError(current.code, current.message);
    }

    if (expectedRevision != null && current.record.revision !== expectedRevision) {
      throw new SessionStateError(
        'SESSION_CONTEXT_REVISION_CONFLICT',
        `Revision conflict: expected ${expectedRevision}, current is ${current.record.revision}`
      );
    }

    if (fs.existsSync(handle)) {
      fs.unlinkSync(handle);
    }
  });
}
