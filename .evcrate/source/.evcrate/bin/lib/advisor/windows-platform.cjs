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

  const allByLower = new Map();
  for (const key of Object.keys(source)) {
    const val = source[key];
    if (val === undefined) continue;
    if (typeof val !== 'string') fail('INVOCATION_INVALID');
    const lower = key.toLowerCase();
    if (allByLower.has(lower)) {
      const existing = allByLower.get(lower);
      if (existing.value !== val) {
        fail('INVOCATION_INVALID');
      }
    } else {
      allByLower.set(lower, { key, value: val });
    }
  }

  const allowedKeys = [...new Set([...commonKeys, ...authKeys])];
  const canonicalMap = new Map();
  for (const k of allowedKeys) {
    canonicalMap.set(k.toLowerCase(), k);
  }

  const result = {};
  for (const [lower, entry] of allByLower) {
    if (entry.key.startsWith('EVCRATE_')) continue;
    if (canonicalMap.has(lower)) {
      result[canonicalMap.get(lower)] = entry.value;
    }
  }
  return result;
}

function canonicalWindowsEnvironmentContext(source, { commonKeys = [], authKeys = [], cwd = process.cwd() } = {}) {
  if (source === null || typeof source !== 'object' || Array.isArray(source)) fail('INVOCATION_INVALID');

  const allByLower = new Map();
  for (const key of Object.keys(source)) {
    const val = source[key];
    if (val === undefined) continue;
    if (typeof val !== 'string') fail('INVOCATION_INVALID');
    const lower = key.toLowerCase();
    if (allByLower.has(lower)) {
      const existing = allByLower.get(lower);
      if (existing.value !== val) {
        fail('INVOCATION_INVALID');
      }
    } else {
      allByLower.set(lower, { key, value: val });
    }
  }

  const allowedKeys = [...new Set([...commonKeys, ...authKeys])];
  const canonicalMap = new Map();
  for (const k of allowedKeys) {
    canonicalMap.set(k.toLowerCase(), k);
  }

  const canonicalEnv = {};
  for (const [lower, entry] of allByLower) {
    if (entry.key.startsWith('EVCRATE_')) {
      canonicalEnv[entry.key] = entry.value;
      continue;
    }
    if (canonicalMap.has(lower)) {
      canonicalEnv[canonicalMap.get(lower)] = entry.value;
    }
  }

  let hasExplicitPath = false;
  let canonicalPath = null;
  if (allByLower.has('path')) {
    hasExplicitPath = true;
    canonicalPath = allByLower.get('path').value;
    canonicalEnv.PATH = canonicalPath;
  } else if (source === process.env && process.env.PATH !== undefined) {
    hasExplicitPath = true;
    canonicalPath = process.env.PATH;
    canonicalEnv.PATH = canonicalPath;
  }

  let trustedHome = null;
  if (allByLower.has('home')) {
    const rawHome = allByLower.get('home').value;
    canonicalEnv.HOME = rawHome;
    trustedHome = rawHome;
  } else {
    try {
      trustedHome = resolveWindowsHome(source);
      canonicalEnv.HOME = trustedHome;
    } catch {}
  }

  const canonicalProjectRoot = canonicalWindowsProjectRoot(cwd);
  const projectId = canonicalWindowsProjectId(canonicalProjectRoot);

  return {
    canonicalEnv: Object.freeze(canonicalEnv),
    hasExplicitPath,
    canonicalPath,
    trustedHome,
    canonicalProjectRoot,
    projectId
  };
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
const SUPPORTED_BACKEND_PACKAGES = Object.freeze({
  codex: Object.freeze(['@openai/codex', 'codex']),
  claude: Object.freeze(['@anthropic-ai/claude-code', 'claude-code', 'claude']),
  pi: Object.freeze(['@earendil-works/pi-coding-agent', '@mariozechner/pi-coding-agent', 'pi-coding-agent', 'pi']),
  omp: Object.freeze(['@oh-my-pi/pi-coding-agent', 'oh-my-pi', 'omp'])
});

function detectBackendFromCommand(command) {
  if (typeof command !== 'string') return null;
  const lower = command.toLowerCase();
  if (lower.includes('codex')) return 'codex';
  if (lower.includes('claude')) return 'claude';
  if (lower.includes('pi')) return 'pi';
  if (lower.includes('omp')) return 'omp';
  return null;
}

function computeFileSha256(filePath) {
  const content = fs.readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

function captureFileIdentity(filePath) {
  if (typeof filePath !== 'string' || !filePath) fail('EXECUTABLE_UNAVAILABLE');
  let realPath;
  try {
    realPath = fs.realpathSync.native(filePath);
  } catch {
    fail('EXECUTABLE_UNAVAILABLE');
  }
  let stat;
  try {
    stat = fs.statSync(realPath);
  } catch {
    fail('EXECUTABLE_UNAVAILABLE');
  }
  if (!stat.isFile()) fail('EXECUTABLE_UNAVAILABLE');
  let hash;
  try {
    hash = computeFileSha256(realPath);
  } catch {
    fail('EXECUTABLE_UNAVAILABLE');
  }
  return Object.freeze({
    path: realPath,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    ino: stat.ino,
    dev: stat.dev,
    hash
  });
}

function verifyFileIdentity(captured) {
  if (!captured || typeof captured !== 'object' || typeof captured.path !== 'string') return false;
  try {
    const stat = fs.statSync(captured.path);
    if (!stat.isFile()) return false;
    if (stat.size !== captured.size) return false;
    const currentHash = computeFileSha256(captured.path);
    if (currentHash !== captured.hash) return false;
    return true;
  } catch {
    return false;
  }
}

function buildWindowsLaunchRecord({
  backend,
  command,
  targetType,
  launcherPath,
  scriptPath = null,
  packagePath = null
}) {
  const launcherIdentity = captureFileIdentity(launcherPath);
  const scriptIdentity = scriptPath ? captureFileIdentity(scriptPath) : null;
  const packageIdentity = packagePath ? captureFileIdentity(packagePath) : null;

  return Object.freeze({
    backend,
    command,
    targetType,
    launcherPath: launcherIdentity.path,
    scriptPath: scriptIdentity ? scriptIdentity.path : null,
    packagePath: packageIdentity ? packageIdentity.path : null,
    launcherIdentity,
    scriptIdentity,
    packageIdentity,
    spawnExe: launcherIdentity.path,
    spawnPrefix: Object.freeze(scriptIdentity ? [scriptIdentity.path] : [])
  });
}

function verifyWindowsLaunchRecord(launchRecord) {
  if (!launchRecord || typeof launchRecord !== 'object') return false;
  if (!verifyFileIdentity(launchRecord.launcherIdentity)) return false;
  if (launchRecord.scriptIdentity && !verifyFileIdentity(launchRecord.scriptIdentity)) return false;
  if (launchRecord.packageIdentity && !verifyFileIdentity(launchRecord.packageIdentity)) return false;
  return true;
}

function inspectFileFormat(filePath) {
  try {
    const real = fs.realpathSync.native(filePath);
    const lower = real.toLowerCase();
    if (lower.endsWith('.exe')) return { type: 'native', realPath: real };
    if (lower.endsWith('.js') || lower.endsWith('.cjs') || lower.endsWith('.mjs')) {
      return { type: 'node-script', realPath: real };
    }
    const stat = fs.statSync(real);
    if (!stat.isFile()) return { type: 'unknown', realPath: null };
    const fd = fs.openSync(real, 'r');
    const buf = Buffer.alloc(512);
    const bytesRead = fs.readSync(fd, buf, 0, 512, 0);
    fs.closeSync(fd);
    if (bytesRead >= 2 && buf[0] === 0x4D && buf[1] === 0x5A) {
      return { type: 'native', realPath: real };
    }
    const head = buf.toString('utf8', 0, bytesRead).trimStart();
    if (head.startsWith('#!/bin/sh') || head.startsWith('#!/bin/bash')
      || head.startsWith('#!/usr/bin/env sh') || head.startsWith('#!/usr/bin/env bash')
      || head.startsWith('@ECHO') || head.startsWith('@echo')
      || head.startsWith('rem ') || head.startsWith('REM ')) {
      return { type: 'shell-or-batch', realPath: real };
    }
    if (head.startsWith('#!') && head.includes('node')) {
      return { type: 'node-script', realPath: real };
    }
    return { type: 'unknown', realPath: real };
  } catch {
    return { type: 'unknown', realPath: null };
  }
}

function resolvePackageBin(candidateCmd, executable) {
  try {
    const dir = path.dirname(candidateCmd);
    const candidateRoots = [
      path.join(dir, 'node_modules')
    ];
    if (path.basename(dir).toLowerCase() === '.bin') {
      const parent = path.resolve(dir, '..');
      candidateRoots.push(parent);
      candidateRoots.push(path.join(parent, 'node_modules'));
    }
    const parent = path.resolve(dir, '..');
    candidateRoots.push(path.join(parent, 'node_modules'));
    candidateRoots.push(parent);

    const backend = detectBackendFromCommand(executable);
    const candidatePackages = SUPPORTED_BACKEND_PACKAGES[backend] || [executable];

    for (const rootDir of candidateRoots) {
      if (!fs.existsSync(rootDir)) continue;
      for (const pkgName of candidatePackages) {
        const pkgDir = path.join(rootDir, pkgName);
        const pkgJsonPath = path.join(pkgDir, 'package.json');
        if (!fs.existsSync(pkgJsonPath)) continue;

        let pkg;
        try {
          pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
        } catch {
          continue;
        }

        if (pkg.name !== pkgName) continue;

        let binRel = null;
        if (typeof pkg.bin === 'string') {
          const unqualified = pkgName.includes('/') ? pkgName.split('/').pop() : pkgName;
          if (unqualified === executable || pkgName === executable) {
            binRel = pkg.bin;
          }
        } else if (pkg.bin && typeof pkg.bin === 'object' && typeof pkg.bin[executable] === 'string') {
          binRel = pkg.bin[executable];
        }

        if (!binRel) continue;

        const fullBin = path.resolve(pkgDir, binRel);
        const normPkgDir = path.normalize(pkgDir).toLowerCase();
        const normFullBin = path.normalize(fullBin).toLowerCase();

        if (!normFullBin.startsWith(normPkgDir + path.sep)) continue;

        let binStat;
        try {
          binStat = fs.statSync(fullBin);
        } catch {
          continue;
        }
        if (!binStat.isFile()) continue;

        let realBin;
        try {
          realBin = fs.realpathSync.native(fullBin);
        } catch {
          continue;
        }

        const lowerRealBin = realBin.toLowerCase();
        if (lowerRealBin.endsWith('.exe')) {
          return {
            targetType: 'native',
            launcherPath: realBin,
            scriptPath: null,
            packagePath: fs.realpathSync.native(pkgJsonPath)
          };
        }
        if (lowerRealBin.endsWith('.js') || lowerRealBin.endsWith('.cjs') || lowerRealBin.endsWith('.mjs')) {
          return {
            targetType: 'node-script',
            launcherPath: process.execPath,
            scriptPath: realBin,
            packagePath: fs.realpathSync.native(pkgJsonPath)
          };
        }
      }
    }
  } catch {}
  return null;
}

function resolveWindowsLaunchRecord(executable, envOrPath, backendHint) {
  if (typeof executable !== 'string' || !executable) return null;
  const backend = backendHint || detectBackendFromCommand(executable);

  if (path.isAbsolute(executable)) {
    const lower = executable.toLowerCase();
    if (lower.endsWith('.exe')) {
      try {
        const stat = fs.statSync(executable);
        if (stat.isFile()) {
          return buildWindowsLaunchRecord({
            backend,
            command: path.basename(executable, '.exe'),
            targetType: 'native',
            launcherPath: executable
          });
        }
      } catch {}
      return null;
    }
    if (lower.endsWith('.js') || lower.endsWith('.cjs') || lower.endsWith('.mjs')) {
      try {
        const stat = fs.statSync(executable);
        if (stat.isFile()) {
          return buildWindowsLaunchRecord({
            backend,
            command: path.basename(executable, path.extname(executable)),
            targetType: 'node-script',
            launcherPath: process.execPath,
            scriptPath: executable
          });
        }
      } catch {}
      return null;
    }
    if (lower.endsWith('.cmd') || lower.endsWith('.bat')) {
      const baseName = path.basename(executable, path.extname(executable));
      const target = resolvePackageBin(executable, baseName);
      if (target) {
        return buildWindowsLaunchRecord({
          backend,
          command: baseName,
          targetType: target.targetType,
          launcherPath: target.launcherPath,
          scriptPath: target.scriptPath,
          packagePath: target.packagePath
        });
      }
      return null;
    }
    if (fs.existsSync(`${executable}.exe`)) {
      try {
        const stat = fs.statSync(`${executable}.exe`);
        if (stat.isFile()) {
          return buildWindowsLaunchRecord({
            backend,
            command: path.basename(executable),
            targetType: 'native',
            launcherPath: `${executable}.exe`
          });
        }
      } catch {}
    }
    if (fs.existsSync(`${executable}.cmd`)) {
      const target = resolvePackageBin(`${executable}.cmd`, path.basename(executable));
      if (target) {
        return buildWindowsLaunchRecord({
          backend,
          command: path.basename(executable),
          targetType: target.targetType,
          launcherPath: target.launcherPath,
          scriptPath: target.scriptPath,
          packagePath: target.packagePath
        });
      }
    }
    for (const ext of ['.js', '.cjs']) {
      if (fs.existsSync(`${executable}${ext}`)) {
        try {
          const stat = fs.statSync(`${executable}${ext}`);
          if (stat.isFile()) {
            return buildWindowsLaunchRecord({
              backend,
              command: path.basename(executable),
              targetType: 'node-script',
              launcherPath: process.execPath,
              scriptPath: `${executable}${ext}`
            });
          }
        } catch {}
      }
    }
    try {
      const stat = fs.statSync(executable);
      if (stat.isFile()) {
        const inspected = inspectFileFormat(executable);
        if (inspected.type === 'native') {
          return buildWindowsLaunchRecord({
            backend,
            command: path.basename(executable),
            targetType: 'native',
            launcherPath: inspected.realPath
          });
        }
        if (inspected.type === 'node-script') {
          return buildWindowsLaunchRecord({
            backend,
            command: path.basename(executable),
            targetType: 'node-script',
            launcherPath: process.execPath,
            scriptPath: inspected.realPath
          });
        }
      }
    } catch {}
    return null;
  }

  let dirs;
  if (typeof envOrPath === 'string') {
    dirs = envOrPath ? envOrPath.split(path.delimiter) : [];
  } else if (envOrPath && typeof envOrPath === 'object') {
    if (envOrPath.PATH !== undefined) {
      dirs = envOrPath.PATH ? envOrPath.PATH.split(path.delimiter) : [];
    } else {
      dirs = [];
    }
  } else {
    dirs = (process.env.PATH || '').split(path.delimiter);
  }

  for (const dir of dirs) {
    if (!dir) continue;

    const exePath = path.join(dir, `${executable}.exe`);
    try {
      if (fs.existsSync(exePath) && fs.statSync(exePath).isFile()) {
        return buildWindowsLaunchRecord({
          backend,
          command: executable,
          targetType: 'native',
          launcherPath: exePath
        });
      }
    } catch {}

    const cmdPath = path.join(dir, `${executable}.cmd`);
    try {
      if (fs.existsSync(cmdPath) && fs.statSync(cmdPath).isFile()) {
        const target = resolvePackageBin(cmdPath, executable);
        if (target) {
          return buildWindowsLaunchRecord({
            backend,
            command: executable,
            targetType: target.targetType,
            launcherPath: target.launcherPath,
            scriptPath: target.scriptPath,
            packagePath: target.packagePath
          });
        }
      }
    } catch {}

    for (const ext of ['.js', '.cjs']) {
      const scriptCandidate = path.join(dir, `${executable}${ext}`);
      try {
        if (fs.existsSync(scriptCandidate) && fs.statSync(scriptCandidate).isFile()) {
          return buildWindowsLaunchRecord({
            backend,
            command: executable,
            targetType: 'node-script',
            launcherPath: process.execPath,
            scriptPath: scriptCandidate
          });
        }
      } catch {}
    }

    const bareCandidate = path.join(dir, executable);
    try {
      if (fs.existsSync(bareCandidate) && fs.statSync(bareCandidate).isFile()) {
        const inspected = inspectFileFormat(bareCandidate);
        if (inspected.type === 'native') {
          return buildWindowsLaunchRecord({
            backend,
            command: executable,
            targetType: 'native',
            launcherPath: inspected.realPath
          });
        }
        if (inspected.type === 'node-script') {
          return buildWindowsLaunchRecord({
            backend,
            command: executable,
            targetType: 'node-script',
            launcherPath: process.execPath,
            scriptPath: inspected.realPath
          });
        }
        if (inspected.type === 'shell-or-batch') {
          if (fs.existsSync(cmdPath) && fs.statSync(cmdPath).isFile()) {
            const target = resolvePackageBin(cmdPath, executable);
            if (target) {
              return buildWindowsLaunchRecord({
                backend,
                command: executable,
                targetType: target.targetType,
                launcherPath: target.launcherPath,
                scriptPath: target.scriptPath,
                packagePath: target.packagePath
              });
            }
          }
          continue;
        }
      }
    } catch {}
  }

  return null;
}

function resolveWindowsExecutable(executable, envPath) {
  const record = resolveWindowsLaunchRecord(executable, envPath);
  if (!record) return null;
  return record.targetType === 'node-script' ? record.scriptPath : record.launcherPath;
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
  canonicalWindowsEnvironmentContext,
  resolveWindowsExecutable,
  resolveWindowsLaunchRecord,
  verifyWindowsLaunchRecord,
  captureFileIdentity,
  verifyFileIdentity,
  SUPPORTED_BACKEND_PACKAGES,
  buildWindowsCommandLine,
  superviseWindowsInvocation,
  observeConsoleWindows,
  readPinnedFileWindows,
  writePinnedFileWindows,
  verifyPinnedDirectoryWindows
};
