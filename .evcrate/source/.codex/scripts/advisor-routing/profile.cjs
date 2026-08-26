'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRoutingError } = require('./errors.cjs');
const {
  MAX_EFFORT_BYTES,
  MAX_MODEL_BYTES,
  MAX_POLICY_BYTES,
  HOSTS,
  EXECUTIONS,
  decodeUtf8,
  parseJsonDocument,
  deepFreeze,
  validateCapabilities,
  validateEntry,
  validatePolicy
} = require('./policy-schema.cjs');

function fail(code) {
  throw createRoutingError(code);
}

function existingStat(file) {
  try { return fs.lstatSync(file); } catch (error) {
    if (error.code === 'ENOENT') return null;
    fail('ROUTE_PATH_UNSAFE');
  }
}

function assertDirectorySafety(stat) {
  // Windows ACLs have no portable uid/mode equivalent. Unsupported no-follow
  // reads fail closed; ACL enforcement remains platform-owned and best-effort.
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail('ROUTE_PATH_UNSAFE');
  if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) fail('ROUTE_PATH_UNSAFE');
  if (process.platform !== 'win32' && (stat.mode & 0o022) !== 0) fail('ROUTE_PATH_UNSAFE');
}

function assertPolicyFileSafety(stat) {
  if (stat.isSymbolicLink() || !stat.isFile()) fail('ROUTE_PATH_UNSAFE');
  if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) fail('ROUTE_PATH_UNSAFE');
  if (process.platform !== 'win32' && (stat.mode & 0o777) !== 0o600) fail('ROUTE_PATH_UNSAFE');
}

function identity(stat) {
  return { dev: stat.dev, ino: stat.ino };
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function realPath(file) {
  try { return fs.realpathSync.native(file); } catch { fail('ROUTE_PATH_UNSAFE'); }
}

function resolveHomeValue(home) {
  if (typeof home !== 'string' || !home || home.includes('\0') || !path.isAbsolute(home)
    || path.parse(home).root === path.normalize(home)) fail('HOME_UNAVAILABLE');
  return path.normalize(home);
}

function platformHome() {
  try { return resolveHomeValue(os.homedir()); } catch (error) {
    if (error.name === 'AdvisorRoutingError') throw error;
    fail('HOME_UNAVAILABLE');
  }
}

function stableDirectory(file) {
  const stat = existingStat(file);
  if (!stat) fail('HOME_UNAVAILABLE');
  assertDirectorySafety(stat);
  return { path: file, identity: identity(stat), realpath: realPath(file) };
}

function createContext(home) {
  const homeDirectory = stableDirectory(resolveHomeValue(home));
  const policyDirectoryPath = path.join(homeDirectory.path, '.evcrate');
  const policyDirectoryStat = existingStat(policyDirectoryPath);
  const policyDirectory = policyDirectoryStat
    ? stableDirectory(policyDirectoryPath)
    : null;
  return {
    homeDirectory,
    policyDirectory,
    policyPath: path.join(policyDirectoryPath, 'advisor-routing.json')
  };
}

function assertContextStable(context) {
  for (const directory of [context.homeDirectory, context.policyDirectory].filter(Boolean)) {
    const current = existingStat(directory.path);
    if (!current || !sameIdentity(identity(current), directory.identity)
      || realPath(directory.path) !== directory.realpath) fail('ROUTE_PATH_UNSAFE');
    assertDirectorySafety(current);
  }
}

function resolvePolicyPath() {
  return createContext(platformHome()).policyPath;
}

function readPolicyFile(context, expectedStat) {
  const noFollow = fs.constants.O_NOFOLLOW;
  if (typeof noFollow !== 'number') fail('ROUTE_PATH_UNSAFE');
  assertContextStable(context);
  let descriptor;
  try {
    descriptor = fs.openSync(context.policyPath, fs.constants.O_RDONLY | noFollow);
    const initial = fs.fstatSync(descriptor);
    assertPolicyFileSafety(initial);
    if (!sameIdentity(identity(initial), identity(expectedStat)) || initial.size > MAX_POLICY_BYTES) {
      fail(initial.size > MAX_POLICY_BYTES ? 'ROUTE_POLICY_OVERSIZED' : 'ROUTE_PATH_UNSAFE');
    }
    assertContextStable(context);
    const pathStat = existingStat(context.policyPath);
    if (!pathStat || !sameIdentity(identity(pathStat), identity(initial))) fail('ROUTE_PATH_UNSAFE');
    const buffer = Buffer.alloc(initial.size);
    const length = fs.readSync(descriptor, buffer, 0, initial.size, 0);
    const final = fs.fstatSync(descriptor);
    if (length !== initial.size || !sameIdentity(identity(final), identity(initial))) fail('ROUTE_PATH_UNSAFE');
    if (final.size !== initial.size) {
      fail(final.size > MAX_POLICY_BYTES ? 'ROUTE_POLICY_OVERSIZED' : 'ROUTE_PATH_UNSAFE');
    }
    assertPolicyFileSafety(final);
    assertContextStable(context);
    const finalPathStat = existingStat(context.policyPath);
    if (!finalPathStat || !sameIdentity(identity(finalPathStat), identity(final))
      || finalPathStat.size !== final.size) fail('ROUTE_PATH_UNSAFE');
    return decodeUtf8(buffer);
  } catch (error) {
    if (error.name === 'AdvisorRoutingError') throw error;
    fail('ROUTE_PATH_UNSAFE');
  } finally {
    if (descriptor !== undefined) {
      try { fs.closeSync(descriptor); } catch { /* best effort */ }
    }
  }
}

function loadFromContext(context) {
  if (!context.policyDirectory) {
    assertContextStable(context);
    if (existingStat(path.dirname(context.policyPath))) fail('ROUTE_PATH_UNSAFE');
    return Object.freeze({ source: 'builtin', present: false, policy: null, path: context.policyPath });
  }
  assertContextStable(context);
  const stat = existingStat(context.policyPath);
  if (!stat) {
    assertContextStable(context);
    if (existingStat(context.policyPath)) fail('ROUTE_PATH_UNSAFE');
    return Object.freeze({ source: 'builtin', present: false, policy: null, path: context.policyPath });
  }
  assertPolicyFileSafety(stat);
  let policy;
  try { policy = validatePolicy(parseJsonDocument(readPolicyFile(context, stat))); }
  catch (error) {
    if (error.name === 'AdvisorRoutingError') throw error;
    throw createRoutingError('ROUTE_POLICY_MALFORMED');
  }
  return Object.freeze({ source: 'global', present: true, policy, path: context.policyPath });
}

function loadGlobalPolicy() {
  return loadFromContext(createContext(platformHome()));
}

module.exports = {
  EXECUTIONS,
  HOSTS,
  MAX_EFFORT_BYTES,
  MAX_MODEL_BYTES,
  MAX_POLICY_BYTES,
  deepFreeze,
  loadGlobalPolicy,
  parseJsonDocument,
  resolvePolicyPath,
  validateCapabilities,
  validateEntry,
  validatePolicy
};
