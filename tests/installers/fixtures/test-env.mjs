import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const PROJECT_ROOT = path.resolve(import.meta.dirname, '../../..');
export const INSTALL_SH = path.join(PROJECT_ROOT, 'install.sh');
if (process.platform !== 'win32' && fs.existsSync(INSTALL_SH)) {
  try {
    const stat = fs.statSync(INSTALL_SH);
    if ((stat.mode & 0o111) === 0) {
      fs.chmodSync(INSTALL_SH, 0o755);
    }
  } catch { /* ignore */ }
}

export function createIsolatedEnv() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'evcrate-test-env-'));
  const assetsDir = path.join(tmp, 'assets');
  const dataDir = path.join(tmp, 'data');
  const stateDir = path.join(tmp, 'state');
  const binDir = path.join(tmp, 'bin');

  fs.mkdirSync(assetsDir, { recursive: true });
  fs.mkdirSync(binDir, { recursive: true });

  const cleanup = () => {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch { /* ignore */ }
  };

  return { tmp, assetsDir, dataDir, stateDir, binDir, cleanup };
}
