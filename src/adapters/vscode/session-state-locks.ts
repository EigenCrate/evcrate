import * as fs from 'node:fs';
import * as path from 'node:path';
import { SessionStateError } from './session-state-types.js';

export function ensureSecureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

function hasErrorCode(err: unknown, expectedCode: string): boolean {
  if (err && typeof err === 'object' && 'code' in err) {
    return err.code === expectedCode;
  }
  return false;
}

export function withFileLock<T>(lockPath: string, fn: () => T, timeoutMs: number = 1000): T {
  const deadline = Date.now() + timeoutMs;
  let acquired = false;

  while (Date.now() <= deadline) {
    try {
      ensureSecureDir(path.dirname(lockPath));
      const fd = fs.openSync(lockPath, 'wx', 0o600);
      fs.closeSync(fd);
      acquired = true;
      break;
    } catch (err: unknown) {
      if (hasErrorCode(err, 'EEXIST')) {
        try {
          const stat = fs.statSync(lockPath);
          if (Date.now() - stat.mtimeMs > 5000) {
            fs.unlinkSync(lockPath);
            continue;
          }
        } catch {}
      }
      const pause = Date.now() + 10;
      while (Date.now() < pause) {
        // short wait
      }
    }
  }

  if (!acquired) {
    throw new SessionStateError('SESSION_CONTEXT_UNAVAILABLE', `Could not acquire lock: ${lockPath}`);
  }

  try {
    return fn();
  } finally {
    try {
      if (fs.existsSync(lockPath)) {
        fs.unlinkSync(lockPath);
      }
    } catch {}
  }
}
