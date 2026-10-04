import * as fs from 'node:fs';
import * as path from 'node:path';
import type { VscodeSessionStateRecord } from './session-state-types.js';
import { withFileLock } from './session-state-locks.js';

export const MAX_RECORD_BYTES = 16384;
export const MAX_PROJECT_RECORDS = 256;
export const MAX_USER_RECORDS = 1024;
export const EXPIRY_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export function isSessionRecord(val: unknown): val is VscodeSessionStateRecord {
  if (!val || typeof val !== 'object') return false;
  return (
    'version' in val && val.version === 1 &&
    'target' in val && val.target === 'vscode' &&
    'lastSeenAt' in val && typeof val.lastSeenAt === 'number'
  );
}

export function sweepExpiredSessions(userDir: string, maxCandidates: number = 64, now: number = Date.now()): number {
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
        const lockPath = `${filePath}.lock`;
        try {
          withFileLock(lockPath, () => {
            const stat = fs.statSync(filePath);
            if (stat.size > MAX_RECORD_BYTES) return;
            const text = fs.readFileSync(filePath, 'utf8');
            const data: unknown = JSON.parse(text);
            if (isSessionRecord(data) && (now - data.lastSeenAt > EXPIRY_DURATION_MS)) {
              fs.unlinkSync(filePath);
              deletedCount++;
            }
          }, 50);
        } catch {}
      }
    }
  } catch {}

  return deletedCount;
}

export function countUserSessions(userDir: string): { total: number; byProject: Record<string, number> } {
  const result = { total: 0, byProject: {} as Record<string, number> };
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
