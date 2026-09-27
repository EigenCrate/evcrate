'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { createHash, randomUUID } = require('node:crypto');
const { EventEmitter } = require('node:events');
const { createRoutingError } = require('./errors.cjs');

function fail(code) { throw createRoutingError(code); }

const isWindows = process.platform === 'win32';
const SYSTEM_ROOT = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows';
const POWERSHELL_EXE = path.join(SYSTEM_ROOT, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const WINDOWS_NATIVE_PS1 = path.join(__dirname, 'windows-native.ps1');

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
    if (!self || !self.start) return 'unknown';
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

function quoteWindowsArg(arg) {
  if (typeof arg !== 'string') arg = String(arg);
  if (arg.length === 0) return '""';
  if (!/[\s"\\]/u.test(arg)) return arg;
  return '"' + arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, '$1$1') + '"';
}

function buildWindowsCommandLine(executable, argv = []) {
  const parts = [quoteWindowsArg(executable)];
  for (const arg of argv) {
    parts.push(quoteWindowsArg(arg));
  }
  return parts.join(' ');
}

function superviseWindowsInvocation({
  executable,
  argv = [],
  cwd,
  env = process.env,
  prompt = null,
  killGraceMs = 250
}) {
  const emitter = new EventEmitter();
  const cmdLine = buildWindowsCommandLine(executable, argv);
  let completionResolve;
  emitter.completionPromise = new Promise((resolve) => {
    completionResolve = resolve;
  });

  let child;
  try {
    child = spawn(POWERSHELL_EXE, [
      '-NoProfile',
      '-NonInteractive',
      '-File',
      WINDOWS_NATIVE_PS1,
      'supervise-invocation'
    ], {
      cwd: undefined,
      env,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });
  } catch (err) {
    const error = createRoutingError(err?.code === 'ENOENT' ? 'EXECUTABLE_UNAVAILABLE' : 'PROCESS_FAILED');
    process.nextTick(() => {
      emitter.emit('error', error);
      completionResolve({ outcome: 'unconfirmed', activeProcesses: -1 });
    });
    emitter.cancel = () => {};
    emitter.close = () => {};
    return emitter;
  }

  emitter.pid = child.pid;
  let closed = false;
  let cleanupSeen = false;

  const req = JSON.stringify({
    app: executable,
    cmdLine,
    cwd: cwd || null,
    prompt: prompt || null,
    killGraceMs
  });

  child.stdin.write(req + '\n');

  emitter.cancel = () => {
    if (closed) return;
    try {
      if (child.stdin?.writable) {
        child.stdin.write('CANCEL\n');
      }
    } catch {}
  };

  emitter.close = () => {
    if (closed) return;
    closed = true;
    try {
      child.stdin?.end();
    } catch {}
  };

  let buffer = '';
  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop();
    for (const line of lines) {
      if (!line) continue;
      if (line.startsWith('SPAWNED:')) {
        const parts = line.slice(8).split(':');
        const pid = parseInt(parts[0], 10);
        const startToken = parts[1] || null;
        emitter.emit('spawned', { pid, startToken });
      } else if (line.startsWith('O:')) {
        const data = Buffer.from(line.slice(2), 'base64');
        emitter.emit('stdout', data);
      } else if (line.startsWith('E:')) {
        const data = Buffer.from(line.slice(2), 'base64');
        emitter.emit('stderr', data);
      } else if (line.startsWith('CLEANUP:')) {
        cleanupSeen = true;
        const parts = line.slice(8).split(':');
        const outcome = parts[0] === 'confirmed' ? 'confirmed' : 'unconfirmed';
        const activeProcesses = parseInt(parts[1], 10);
        emitter.emit('cleanup', { outcome, activeProcesses });
        completionResolve({ outcome, activeProcesses });
      } else if (line.startsWith('EXIT:')) {
        const parts = line.slice(5).split(':');
        const exitCode = parseInt(parts[0], 10);
        const signal = parts[1] && parts[1] !== 'null' ? parts[1] : null;
        emitter.emit('exit', { exitCode, signal });
      } else if (line.startsWith('ERROR:')) {
        const parts = line.slice(6).split(':');
        let code = 'PROCESS_FAILED';
        if (parts[0] === 'LAUNCH_FAILED') {
          const errNum = parseInt(parts[1], 10);
          if (errNum === 2 || errNum === 3) code = 'EXECUTABLE_UNAVAILABLE';
        }
        emitter.emit('error', createRoutingError(code));
      }
    }
  });

  child.on('error', (err) => {
    if (!cleanupSeen) {
      completionResolve({ outcome: 'unconfirmed', activeProcesses: -1 });
    }
    emitter.emit('error', createRoutingError(err?.code === 'ENOENT' ? 'EXECUTABLE_UNAVAILABLE' : 'PROCESS_FAILED'));
  });

  child.on('close', (code) => {
    if (!cleanupSeen) {
      emitter.emit('cleanup', { outcome: 'unconfirmed', activeProcesses: -1 });
      completionResolve({ outcome: 'unconfirmed', activeProcesses: -1 });
    }
    emitter.emit('close', code);
  });

  return emitter;
}

function observeConsoleWindows(decisionContext, challenge, signal, timeoutMs) {
  if (signal?.aborted) return Promise.reject(createRoutingError('CANCELLED'));
  const effectiveTimeout = timeoutMs !== undefined
    ? timeoutMs
    : (Number(process.env.EVCRATE_CONSOLE_TIMEOUT_MS) || 3000);
  return new Promise((resolve, reject) => {
    let settled = false;
    const b64Context = Buffer.from(decisionContext || '', 'utf8').toString('base64');
    let child;
    try {
      child = spawn(POWERSHELL_EXE, [
        '-NoProfile',
        '-NonInteractive',
        '-File',
        WINDOWS_NATIVE_PS1,
        'console-observe',
        challenge,
        String(effectiveTimeout),
        b64Context
      ], {
        windowsHide: false,
        stdio: ['ignore', 'pipe', 'ignore']
      });
    } catch {
      reject(createRoutingError('HUMAN_EVENT_REQUIRED'));
      return;
    }

    let stdout = '';
    child.stdout.on('data', (d) => { stdout += d.toString('utf8'); });

    const onAbort = () => {
      if (settled) return;
      settled = true;
      try { child.kill(); } catch {}
      reject(createRoutingError('CANCELLED'));
    };

    signal?.addEventListener('abort', onAbort, { once: true });

    child.on('error', () => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      reject(createRoutingError('HUMAN_EVENT_REQUIRED'));
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      if (signal?.aborted) {
        reject(createRoutingError('CANCELLED'));
        return;
      }
      const trimmed = stdout.trim();
      if (code === 0 && trimmed === 'OBSERVED') {
        resolve(Object.freeze({
          event_id: randomUUID(),
          source: 'local-terminal-confirmation'
        }));
      } else if (trimmed === 'CANCELLED') {
        reject(createRoutingError('CANCELLED'));
      } else {
        reject(createRoutingError('HUMAN_EVENT_REQUIRED'));
      }
    });
  });
}


function readPinnedFileWindows(filePath, maxBytes = 64 * 1024) {
  if (!isWindows) return null;
  try {
    const out = execFileSync(POWERSHELL_EXE, ['-NoProfile', '-File', WINDOWS_NATIVE_PS1, 'read-pinned', filePath, String(maxBytes)], {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    const data = JSON.parse(out);
    if (data.status === 'not_found') return null;
    if (data.status === 'ok') {
      let mtimeNs = 0n;
      try {
        const lst = fs.lstatSync(filePath, { bigint: true });
        if (lst) mtimeNs = lst.mtimeNs;
      } catch {}
      return {
        stat: {
          dev: BigInt(data.dev),
          ino: BigInt(data.ino),
          size: BigInt(data.size),
          nlink: 1n,
          mtimeNs,
          isFile: () => true,
          isDirectory: () => false,
          isSymbolicLink: () => false
        },
        bytes: Buffer.from(data.bytes, 'base64')
      };
    }
    return null;
  } catch {
    return null;
  }
}

function writePinnedFileWindows(filePath, bytes, { replaceIfExists = false, expectedDev = null, expectedIno = null, expectedDigest = null } = {}) {
  if (!isWindows) return { status: 'error', code: 'PLATFORM_NOT_SUPPORTED' };
  const b64 = Buffer.isBuffer(bytes) ? bytes.toString('base64') : Buffer.from(bytes).toString('base64');
  try {
    const args = ['-NoProfile', '-File', WINDOWS_NATIVE_PS1, 'write-pinned', filePath, 'STDIN', String(Boolean(replaceIfExists))];
    if (expectedDev !== null && expectedDev !== undefined) {
      args.push(String(expectedDev));
      if (expectedIno !== null && expectedIno !== undefined) {
        args.push(String(expectedIno));
        if (expectedDigest !== null && expectedDigest !== undefined) {
          args.push(String(expectedDigest));
        }
      }
    }
    const out = execFileSync(POWERSHELL_EXE, args, {
      input: b64,
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'ignore']
    }).trim();
    const data = JSON.parse(out);
    return data;
  } catch (err) {
    if (err.status === 3) return { status: 'conflict', code: 'STATE_CONFLICT' };
    return { status: 'error', code: 'WRITE_FAILED' };
  }
}

function verifyPinnedDirectoryWindows(dirPath) {
  if (!isWindows) return false;
  try {
    const out = execFileSync(POWERSHELL_EXE, ['-NoProfile', '-File', WINDOWS_NATIVE_PS1, 'verify-pinned', dirPath], {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    const data = JSON.parse(out);
    return data.status === 'ok';
  } catch {
    return false;
  }
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
  buildWindowsCommandLine,
  superviseWindowsInvocation,
  observeConsoleWindows,
  readPinnedFileWindows,
  writePinnedFileWindows,
  verifyPinnedDirectoryWindows
};
