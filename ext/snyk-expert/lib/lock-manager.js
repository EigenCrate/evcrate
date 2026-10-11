import fs from 'node:fs';
import path from 'node:path';
import { isWithin } from './target-resolver.js';

export function acquireLock(lockPath) {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  try {
    const fd = fs.openSync(lockPath, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY);
    fs.writeSync(fd, JSON.stringify({ pid: process.pid, time: Date.now() }));
    fs.closeSync(fd);
  } catch (error) {
    if (error.code === 'EEXIST') {
      const err = new Error(`Installation locked by another process: ${lockPath}`);
      err.code = 'ERR_INSTALL_LOCKED';
      throw err;
    }
    throw error;
  }
}

export function releaseLock(lockPath) {
  try {
    fs.unlinkSync(lockPath);
  } catch {}
}

export function pruneEmptyDirectories(directory, root) {
  try {
    let current = directory;
    while (current !== root && isWithin(root, current)) {
      if (fs.existsSync(current) && fs.readdirSync(current).length === 0) {
        fs.rmdirSync(current);
        current = path.dirname(current);
      } else {
        break;
      }
    }
  } catch {}
}
