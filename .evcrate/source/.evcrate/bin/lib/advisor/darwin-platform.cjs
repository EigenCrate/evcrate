'use strict';

/*
 * darwin-platform.cjs
 *
 * Darwin native loader, stat adapter, and process status/identity wrappers.
 *
 * Bridge ABI: 1
 *
 * Copyright (c) 2026 EigenCrate. Licensed under MIT.
 */

const { createRoutingError } = require('./errors.cjs');

function fail(code, message) {
  throw createRoutingError(code, message ? { message } : undefined);
}

let nativeAddon = null;

if (process.platform === 'darwin') {
  try {
    if (process.arch === 'arm64') {
      nativeAddon = require('./native/darwin/prebuilt/darwin-arm64/advisor-native.node');
    } else if (process.arch === 'x64') {
      nativeAddon = require('./native/darwin/prebuilt/darwin-x64/advisor-native.node');
    } else {
      fail('PROCESS_FAILED', `Unsupported Darwin architecture: ${process.arch}`);
    }
  } catch (error) {
    if (error?.code === 'PROCESS_FAILED') throw error;
    fail('STATE_IO_FAILED', `Failed to load Darwin native addon: ${error?.message || error}`);
  }

  if (!nativeAddon || nativeAddon.abiVersion !== 1) {
    fail('STATE_IO_FAILED', `Incompatible Darwin native bridge ABI: expected 1, got ${nativeAddon?.abiVersion}`);
  }
}

function getNativeAddon() {
  if (!nativeAddon) {
    fail('STATE_IO_FAILED', 'Darwin native addon not loaded on this platform');
  }
  return nativeAddon;
}

function wrapStat(rawStat) {
  if (!rawStat) return null;
  return Object.freeze({
    type: rawStat.type,
    dev: rawStat.dev,
    ino: rawStat.ino,
    nlink: rawStat.nlink,
    size: rawStat.size,
    mtimeNs: rawStat.mtimeNs,
    isFile: () => rawStat.type === 'file',
    isDirectory: () => rawStat.type === 'directory',
    isSymbolicLink: () => rawStat.type === 'symlink'
  });
}

function validIdentity(identity) {
  return identity && typeof identity === 'object' && !Array.isArray(identity)
    && Object.keys(identity).length === 2 && Object.hasOwn(identity, 'pid') && Object.hasOwn(identity, 'start')
    && Number.isSafeInteger(identity.pid) && identity.pid > 0 && identity.pid <= 2147483647
    && (identity.start === null || (typeof identity.start === 'string' && /^\d{1,32}$/u.test(identity.start)));
}

function getDarwinProcessIdentity(pid = process.pid) {
  if (process.platform !== 'darwin' || !nativeAddon) {
    return { pid, start: null };
  }
  try {
    const snapshot = nativeAddon.processSnapshot(pid);
    if (snapshot && snapshot.kind === 'present' && typeof snapshot.start === 'string' && /^\d{1,32}$/u.test(snapshot.start)) {
      return { pid, start: snapshot.start };
    }
    return { pid, start: null };
  } catch {
    return { pid, start: null };
  }
}

function checkDarwinProcessStatus(identity) {
  if (!validIdentity(identity) || identity.start === null) {
    return 'unknown';
  }
  if (process.platform !== 'darwin' || !nativeAddon) {
    return 'unknown';
  }
  try {
    const snapshot = nativeAddon.processSnapshot(identity.pid);
    if (!snapshot) return 'unknown';
    if (snapshot.kind === 'missing') return 'dead';
    if (snapshot.kind === 'present') {
      return snapshot.start === identity.start ? 'live' : 'dead';
    }
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/* Storage operations */
function openRoot(absoluteDirectory) {
  const native = getNativeAddon();
  const res = native.openRoot(absoluteDirectory);
  return {
    directory: res.directory,
    canonicalPath: res.canonicalPath
  };
}

function openDirectory(parent, leaf, create = false) {
  const native = getNativeAddon();
  return native.openDirectory(parent, leaf, create);
}

function verifyChain(directory) {
  const native = getNativeAddon();
  return native.verifyChain(directory);
}

function statEntry(directory, leaf) {
  const native = getNativeAddon();
  const raw = native.statEntry(directory, leaf);
  return wrapStat(raw);
}

function statHandle(capability) {
  const native = getNativeAddon();
  const raw = native.statHandle(capability);
  return wrapStat(raw);
}

function openRegular(directory, leaf, maxBytes) {
  const native = getNativeAddon();
  return native.openRegular(directory, leaf, maxBytes);
}

function readInto(file, buffer, offset, length, position) {
  const native = getNativeAddon();
  return native.readInto(file, buffer, offset, length, position);
}

function writeExclusive(directory, leaf, bytes) {
  const native = getNativeAddon();
  const raw = native.writeExclusive(directory, leaf, bytes);
  return wrapStat(raw);
}

function commit(directory, tempLeaf, tempStat, targetLeaf, expected) {
  const native = getNativeAddon();
  const raw = native.commit(directory, tempLeaf, tempStat, targetLeaf, expected);
  return wrapStat(raw);
}

function removeOwned(directory, leaf, expectedStat) {
  const native = getNativeAddon();
  return native.removeOwned(directory, leaf, expectedStat);
}

function list(directory, maxEntries = 10000) {
  const native = getNativeAddon();
  return native.list(directory, maxEntries);
}

function removeEmptyDirectory(parent, leaf, expectedIdentity) {
  const native = getNativeAddon();
  return native.removeEmptyDirectory(parent, leaf, expectedIdentity);
}

function sync(capability) {
  const native = getNativeAddon();
  return native.sync(capability);
}

function close(capability) {
  const native = getNativeAddon();
  return native.close(capability);
}

module.exports = {
  abiVersion: 1,
  getDarwinProcessIdentity,
  checkDarwinProcessStatus,
  openRoot,
  openDirectory,
  verifyChain,
  statEntry,
  statHandle,
  openRegular,
  readInto,
  writeExclusive,
  commit,
  removeOwned,
  list,
  removeEmptyDirectory,
  sync,
  close
};
