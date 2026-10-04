import * as fs from 'node:fs';
import * as path from 'node:path';
import { SessionStateError } from './session-state-types.js';

export function ensureSecureDir(dir: string): void {
  const resolved = path.resolve(dir);
  const segments = resolved.split(path.sep);

  let current = segments[0] || path.sep;
  if (process.platform === 'win32' && segments[0] && segments[0].endsWith(':')) {
    current = segments[0] + path.sep;
  }

  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    if (!seg) continue;
    current = path.join(current, seg);

    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(current);
    } catch (err: unknown) {
      if (hasErrorCode(err, 'ENOENT')) {
        try {
          fs.mkdirSync(current, { mode: 0o700 });
        } catch (mkdirErr: unknown) {
          if (!hasErrorCode(mkdirErr, 'EEXIST')) {
            throw mkdirErr;
          }
        }
        stat = fs.lstatSync(current);
      } else {
        throw err;
      }
    }

    if (stat.isSymbolicLink()) {
      throw new SessionStateError('SESSION_CONTEXT_UNAVAILABLE', `Insecure symlink in state directory path: ${current}`);
    }
    if (!stat.isDirectory()) {
      throw new SessionStateError('SESSION_CONTEXT_UNAVAILABLE', `State path component is not a directory: ${current}`);
    }

    if (process.platform !== 'win32' && typeof process.getuid === 'function') {
      const isSystemTempRoot = current === '/tmp' || current === '/var/tmp' || current === '/';
      if (!isSystemTempRoot) {
        const uid = process.getuid();
        if (stat.uid !== uid) {
          throw new SessionStateError('SESSION_CONTEXT_UNAVAILABLE', `Insecure directory ownership on ${current}: owned by uid ${stat.uid}, expected ${uid}`);
        }
        if ((stat.mode & 0o022) !== 0) {
          throw new SessionStateError('SESSION_CONTEXT_UNAVAILABLE', `Insecure directory permissions on ${current}: mode 0${(stat.mode & 0o777).toString(8)} permits group or world write`);
        }
      }
    }
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
  const token = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let lockStat: fs.Stats | null = null;

  while (Date.now() <= deadline) {
    try {
      ensureSecureDir(path.dirname(lockPath));
      const fd = fs.openSync(lockPath, 'wx', 0o600);
      try {
        fs.writeFileSync(fd, token, 'utf8');
      } finally {
        fs.closeSync(fd);
      }
      lockStat = fs.statSync(lockPath);
      acquired = true;
      break;
    } catch (err: unknown) {
      if (hasErrorCode(err, 'EEXIST')) {
        const pause = Date.now() + 10;
        while (Date.now() < pause) {
          // short wait
        }
        continue;
      }
      throw err;
    }
  }

  if (!acquired || !lockStat) {
    throw new SessionStateError('SESSION_CONTEXT_UNAVAILABLE', `Could not acquire lock: ${lockPath}`);
  }

  try {
    return fn();
  } finally {
    try {
      if (fs.existsSync(lockPath)) {
        const currentStat = fs.statSync(lockPath);
        if (currentStat.dev === lockStat.dev && currentStat.ino === lockStat.ino) {
          const content = fs.readFileSync(lockPath, 'utf8');
          if (content === token) {
            fs.unlinkSync(lockPath);
          }
        }
      }
    } catch {}
  }
}
