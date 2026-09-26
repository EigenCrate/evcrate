'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { createRoutingError } = require('./errors.cjs');

function fail(code) { throw createRoutingError(code); }

const isWindows = process.platform === 'win32';
const SYSTEM_ROOT = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows';
const POWERSHELL_EXE = path.join(SYSTEM_ROOT, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const TASKKILL_EXE = path.join(SYSTEM_ROOT, 'System32', 'taskkill.exe');

// 1. Path safety and Canonical Project/Home Identity
function isUnsafeWindowsPath(value) {
  if (typeof value !== 'string' || !value || value.includes('\0')) return true;
  // Reject UNC paths and device paths
  if (value.startsWith('\\\\') || value.startsWith('//')) return true;
  // Must be absolute with drive letter: e.g. C:\ or c:/
  if (!/^[a-zA-Z]:[\\/]/u.test(value)) return true;
  if (value.split(/[\\/]/).some((part) => part === '.' || part === '..')) return true;
  return false;
}

function canonicalWindowsProjectRoot(cwd = process.cwd()) {
  if (typeof cwd !== 'string' || isUnsafeWindowsPath(cwd)) fail('CWD_UNSAFE');
  const normalized = path.normalize(cwd);
  const parsed = path.parse(normalized);
  if (parsed.root.toLowerCase() === normalized.toLowerCase()) fail('CWD_UNSAFE');
  try {
    const lstat = fs.lstatSync(normalized);
    if (lstat.isSymbolicLink() || !lstat.isDirectory()) fail('CWD_UNSAFE');
    const real = fs.realpathSync.native(normalized);
    if (isUnsafeWindowsPath(real)) fail('CWD_UNSAFE');
    const realParsed = path.parse(real);
    if (realParsed.root.toLowerCase() === real.toLowerCase()) fail('CWD_UNSAFE');
    return real;
  } catch {
    fail('CWD_UNSAFE');
  }
}

function resolveWindowsHome(env = process.env) {
  const explicit = env?.HOME;
  if (explicit !== undefined) {
    if (!explicit || isUnsafeWindowsPath(explicit)) fail('HOME_UNAVAILABLE');
    const normalized = path.normalize(explicit);
    const parsed = path.parse(normalized);
    if (parsed.root.toLowerCase() === normalized.toLowerCase()) fail('HOME_UNAVAILABLE');
    try {
      const lstat = fs.lstatSync(normalized);
      if (lstat.isSymbolicLink() || !lstat.isDirectory()) fail('HOME_UNAVAILABLE');
      const real = fs.realpathSync.native(normalized);
      if (isUnsafeWindowsPath(real)) fail('HOME_UNAVAILABLE');
      if (real.toLowerCase() !== normalized.toLowerCase()) fail('HOME_UNAVAILABLE');
      return real;
    } catch {
      fail('HOME_UNAVAILABLE');
    }
  }

  let homedir;
  try { homedir = os.homedir(); } catch { fail('HOME_UNAVAILABLE'); }
  if (isUnsafeWindowsPath(homedir)) fail('HOME_UNAVAILABLE');
  const normalized = path.normalize(homedir);
  const parsed = path.parse(normalized);
  if (parsed.root.toLowerCase() === normalized.toLowerCase()) fail('HOME_UNAVAILABLE');
  try {
    const lstat = fs.lstatSync(normalized);
    if (lstat.isSymbolicLink() || !lstat.isDirectory()) fail('HOME_UNAVAILABLE');
    const real = fs.realpathSync.native(normalized);
    if (isUnsafeWindowsPath(real)) fail('HOME_UNAVAILABLE');
    return real;
  } catch {
    fail('HOME_UNAVAILABLE');
  }
}

function canonicalWindowsProjectId(projectRoot) {
  return createHash('sha256').update(projectRoot).digest('hex');
}

// 2. Canonical Windows Environment Handling
function canonicalizeWindowsEnvironment(source, { commonKeys = [], authKeys = [] } = {}) {
  if (source === null || typeof source !== 'object' || Array.isArray(source)) fail('INVOCATION_INVALID');

  const allowedKeys = [...new Set([...commonKeys, ...authKeys])];
  const canonicalMap = new Map();
  for (const k of allowedKeys) {
    canonicalMap.set(k.toLowerCase(), k);
  }

  const valuesByLower = new Map();
  for (const key of Object.keys(source)) {
    if (key.startsWith('EVCRATE_')) continue;
    const lower = key.toLowerCase();
    if (!canonicalMap.has(lower)) continue;
    const val = source[key];
    if (val === undefined) continue;
    if (typeof val !== 'string') fail('INVOCATION_INVALID');

    if (valuesByLower.has(lower)) {
      const existing = valuesByLower.get(lower);
      if (existing.value !== val) {
        // Conflicting alias: e.g. Path !== PATH
        fail('INVOCATION_INVALID');
      }
    } else {
      valuesByLower.set(lower, { key: canonicalMap.get(lower), value: val });
    }
  }

  const result = {};
  for (const [, entry] of valuesByLower) {
    result[entry.key] = entry.value;
  }
  return result;
}

function assertNoRecursionWindows({ environment = process.env, requestDepth = 0 } = {}, marker, depthKey) {
  if (!environment || typeof environment !== 'object' || Array.isArray(environment)) {
    fail('INVOCATION_INVALID');
  }
  if (!Number.isSafeInteger(requestDepth) || requestDepth < 0) fail('REQUEST_DEPTH_INVALID');
  if (requestDepth > 0) fail('ADVISOR_RECURSION');

  const markerLower = marker.toLowerCase();
  const depthLower = depthKey.toLowerCase();

  for (const key of Object.keys(environment)) {
    const lower = key.toLowerCase();
    if (lower === markerLower) {
      fail('ADVISOR_RECURSION');
    }
    if (lower === depthLower) {
      const inherited = environment[key];
      if (inherited !== undefined && inherited !== '' && inherited !== '0') {
        if (!/^\d+$/u.test(String(inherited))) fail('REQUEST_DEPTH_INVALID');
        fail('ADVISOR_RECURSION');
      }
    }
  }
  return true;
}

// 3. Process Identity and Status on Windows
let cachedSelfIdentity = null;

let cachedUserSid = null;
function getCurrentUserSid() {
  if (cachedUserSid) return cachedUserSid;
  try {
    const script = `[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value`;
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    const out = execFileSync(POWERSHELL_EXE, ['-NoProfile', '-EncodedCommand', encoded], {
      encoding: 'utf8',
      timeout: 3000,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    if (/^S-1-\d+(?:-\d+)+$/u.test(out)) {
      cachedUserSid = out;
      return cachedUserSid;
    }
  } catch {}
  return null;
}

const verifiedOwnersCache = new Map();
const NATIVE_PS1 = path.join(__dirname, 'windows-native.ps1');

function verifyWindowsFileOwnership(filePath) {
  if (!isWindows) return true;
  if (typeof filePath !== 'string' || !filePath) return false;
  const userSid = getCurrentUserSid();
  if (!userSid) return false;

  try {
    const real = fs.realpathSync.native(filePath);
    if (verifiedOwnersCache.has(real)) return verifiedOwnersCache.get(real);
    const out = execFileSync(POWERSHELL_EXE, ['-NoProfile', '-File', NATIVE_PS1, 'verify-owner', real, userSid], {
      encoding: 'utf8',
      timeout: 3000,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    const isValid = out === 'valid';
    verifiedOwnersCache.set(real, isValid);
    return isValid;
  } catch {
    return false;
  }
}

function queryProcessCreationToken(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return null;
  try {
    const script = `try { [System.Diagnostics.Process]::GetProcessById([int]$env:EVCRATE_QUERY_PID).StartTime.ToFileTimeUtc().ToString() } catch { exit 2 }`;
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    const out = execFileSync(POWERSHELL_EXE, ['-NoProfile', '-EncodedCommand', encoded], {
      encoding: 'utf8',
      timeout: 3000,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, EVCRATE_QUERY_PID: String(pid) }
    }).trim();
    return /^\d{1,32}$/u.test(out) ? out : null;
  } catch {
    return null;
  }
}

function getWindowsProcessIdentity(pid = process.pid) {
  if (pid === process.pid) {
    if (cachedSelfIdentity) return cachedSelfIdentity;
    const start = queryProcessCreationToken(pid);
    cachedSelfIdentity = Object.freeze({ pid, start });
    return cachedSelfIdentity;
  }
  return { pid, start: queryProcessCreationToken(pid) };
}

function checkWindowsProcessStatus(identity) {
  if (!identity || typeof identity !== 'object' || !Number.isSafeInteger(identity.pid) || identity.pid <= 0) {
    return 'unknown';
  }
  if (identity.start === null || typeof identity.start !== 'string' || !/^\d{1,32}$/u.test(identity.start)) {
    return 'unknown';
  }
  if (identity.pid === process.pid) {
    const self = getWindowsProcessIdentity(process.pid);
    if (identity.start !== self.start) return 'dead';
    return 'live';
  }
  try {
    const script = `
$id = [int]$env:EVCRATE_TARGET_PID
$expected = $env:EVCRATE_TARGET_START
try {
  $p = [System.Diagnostics.Process]::GetProcessById($id)
  $cur = $p.StartTime.ToFileTimeUtc().ToString()
  if ($expected -and $cur -ne $expected) { 'dead' }
  elseif ($p.HasExited) { 'dead' }
  else { 'live' }
} catch [System.ArgumentException] {
  'dead'
} catch {
  'unknown'
}
`;
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    const result = execFileSync(POWERSHELL_EXE, ['-NoProfile', '-EncodedCommand', encoded], {
      encoding: 'utf8',
      timeout: 3000,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
      env: {
        ...process.env,
        EVCRATE_TARGET_PID: String(identity.pid),
        EVCRATE_TARGET_START: identity.start
      }
    }).trim();
    if (result === 'live' || result === 'dead' || result === 'unknown') return result;
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

// 4. Windows Executable and Package Bin Resolution
function resolvePackageBin(candidateCmd, executable) {
  try {
    const dir = path.dirname(candidateCmd);
    const pkgDir = path.join(dir, 'node_modules', executable);
    const pkgJsonPath = path.join(pkgDir, 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
      let binRel = null;
      if (typeof pkg.bin === 'string') {
        binRel = pkg.bin;
      } else if (pkg.bin && typeof pkg.bin === 'object' && typeof pkg.bin[executable] === 'string') {
        binRel = pkg.bin[executable];
      }
      if (binRel) {
        const fullBin = path.resolve(pkgDir, binRel);
        if (fs.existsSync(fullBin) && fs.statSync(fullBin).isFile()) {
          return fs.realpathSync.native(fullBin);
        }
      }
    }
  } catch {}
  return null;
}

function resolveWindowsExecutable(executable, envPath) {
  if (typeof executable !== 'string' || !executable) return null;
  const extensions = ['', '.exe', '.js', '.cjs'];

  if (path.isAbsolute(executable)) {
    for (const ext of extensions) {
      const candidate = executable.endsWith(ext) && ext !== '' ? executable : `${executable}${ext}`;
      try {
        const stat = fs.statSync(candidate);
        if (stat.isFile()) return fs.realpathSync.native(candidate);
      } catch {}
    }
    if (executable.toLowerCase().endsWith('.cmd') || fs.existsSync(`${executable}.cmd`)) {
      const cmdPath = executable.toLowerCase().endsWith('.cmd') ? executable : `${executable}.cmd`;
      const baseName = path.basename(executable, '.cmd');
      const bin = resolvePackageBin(cmdPath, baseName);
      if (bin) return bin;
    }
    return null;
  }

  const dirs = (envPath || '').split(path.delimiter);
  for (const dir of dirs) {
    if (!dir) continue;
    for (const ext of extensions) {
      const candidate = path.join(dir, `${executable}${ext}`);
      try {
        const stat = fs.statSync(candidate);
        if (stat.isFile()) return fs.realpathSync.native(candidate);
      } catch {}
    }
    const cmdCandidate = path.join(dir, `${executable}.cmd`);
    try {
      if (fs.existsSync(cmdCandidate) && fs.statSync(cmdCandidate).isFile()) {
        const bin = resolvePackageBin(cmdCandidate, executable);
        if (bin) return bin;
      }
    } catch {}
  }
  return null;
}

function killProcessTreeWindows(pid, expectedStartToken) {
  if (!Number.isInteger(pid) || pid <= 0) return;
  if (!expectedStartToken || typeof expectedStartToken !== 'string') return;
  const status = checkWindowsProcessStatus({ pid, start: expectedStartToken });
  if (status !== 'live') return;
  try {
    execFileSync(TASKKILL_EXE, ['/PID', String(pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore'
    });
  } catch {}
}

module.exports = {
  isWindows,
  isUnsafeWindowsPath,
  canonicalWindowsProjectRoot,
  resolveWindowsHome,
  canonicalWindowsProjectId,
  canonicalizeWindowsEnvironment,
  assertNoRecursionWindows,
  getWindowsProcessIdentity,
  checkWindowsProcessStatus,
  resolveWindowsExecutable,
  killProcessTreeWindows,
  verifyWindowsFileOwnership,
  getCurrentUserSid
};
