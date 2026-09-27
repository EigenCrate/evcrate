'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRoutingError, isRoutingError } = require('./errors.cjs');
const { verifyPinnedDirectoryWindows } = require('./windows-platform.cjs');
function fail(code = 'CWD_UNSAFE') { throw createRoutingError(code); }
function rootFor(environment = process.env, tempDirectory = os.tmpdir) {
  const value = environment?.TMPDIR || tempDirectory();
  if (typeof value !== 'string' || !value || !path.isAbsolute(value) || value.includes('\0')) fail('CWD_UNSAFE');
  return path.normalize(value);
}
function assertRoot(root) {
  let stat;
  try { stat = fs.lstatSync(root); } catch { fail('CWD_UNSAFE'); }
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail('CWD_UNSAFE');
  try {
    const real = fs.realpathSync.native(root);
    const resolved = path.resolve(root);
    if (process.platform === 'win32') {
      if (real.toLowerCase() !== resolved.toLowerCase()) fail('CWD_UNSAFE');
      if (!verifyPinnedDirectoryWindows(real)) fail('CWD_UNSAFE');
    } else {
      if (real !== resolved) fail('CWD_UNSAFE');
    }
  }
  catch (error) {
    if (error.name === 'AdvisorRoutingError') throw error;
    fail('CWD_UNSAFE');
  }
  return stat;
}
function verifyWorkspace(workspace) {
  if (!workspace || typeof workspace.path !== 'string') fail('CWD_UNSAFE');
  let stat;
  try { stat = fs.lstatSync(workspace.path); } catch { fail('CWD_UNSAFE'); }
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail('CWD_UNSAFE');
  if (fs.realpathSync.native(workspace.path) !== workspace.realpath) fail('CWD_UNSAFE');
  if (process.platform === 'win32' && !verifyPinnedDirectoryWindows(workspace.path)) fail('CWD_UNSAFE');
  if (fs.readdirSync(workspace.path).length !== 0) fail('CWD_UNSAFE');
  return workspace;
}
function safeRemoveTree(targetPath, expectedDev, fsImpl = fs) {
  let entries;
  try {
    entries = fsImpl.readdirSync(targetPath);
  } catch {
    throw createRoutingError('CLEANUP_UNCONFIRMED');
  }
  for (const entry of entries) {
    const full = path.join(targetPath, entry);
    let st;
    try {
      st = fsImpl.lstatSync(full, { bigint: true });
    } catch {
      throw createRoutingError('CLEANUP_UNCONFIRMED');
    }
    if (st.isSymbolicLink()) {
      throw createRoutingError('CLEANUP_UNCONFIRMED');
    } else if (st.isDirectory()) {
      if (expectedDev !== undefined && st.dev.toString() !== expectedDev) {
        throw createRoutingError('CLEANUP_UNCONFIRMED');
      }
      safeRemoveTree(full, expectedDev, fsImpl);
      let preRmdir;
      try {
        preRmdir = fsImpl.lstatSync(full, { bigint: true });
      } catch {
        throw createRoutingError('CLEANUP_UNCONFIRMED');
      }
      if (preRmdir.isSymbolicLink() || !preRmdir.isDirectory() || (expectedDev !== undefined && preRmdir.dev.toString() !== expectedDev)) {
        throw createRoutingError('CLEANUP_UNCONFIRMED');
      }
      try {
        fsImpl.rmdirSync(full);
      } catch {
        throw createRoutingError('CLEANUP_UNCONFIRMED');
      }
    } else {
      try {
        fsImpl.unlinkSync(full);
      } catch {
        throw createRoutingError('CLEANUP_UNCONFIRMED');
      }
    }
  }
}

function createWorkspace({ environment = process.env, tempDirectory = os.tmpdir, fsImpl = fs } = {}) {
  const root = rootFor(environment, tempDirectory);
  assertRoot(root);
  let directory;
  let initialStat;
  let rootStat;
  try {
    rootStat = fsImpl.lstatSync(root, { bigint: true });
    directory = fsImpl.mkdtempSync(path.join(root, 'evcrate-advisor-'));
    initialStat = fsImpl.lstatSync(directory, { bigint: true });
  } catch { fail('CWD_UNSAFE'); }
  try {
    const workspace = Object.freeze({
      path: directory,
      realpath: fsImpl.realpathSync.native(directory),
      root,
      identity: Object.freeze({
        dev: initialStat.dev.toString(),
        ino: initialStat.ino.toString(),
        rootDev: rootStat.dev.toString(),
        rootIno: rootStat.ino.toString()
      })
    });
    verifyWorkspace(workspace);
    return workspace;
  } catch (error) {
    try {
      const current = fsImpl.lstatSync(directory, { bigint: true });
      if (!current.isSymbolicLink() && current.isDirectory()
          && current.dev.toString() === initialStat.dev.toString()
          && current.ino.toString() === initialStat.ino.toString()) {
        safeRemoveTree(directory, initialStat.dev.toString(), fsImpl);
        fsImpl.rmdirSync(directory);
      }
    } catch { /* best effort on create failure */ }
    if (error.name === 'AdvisorRoutingError') throw error;
    fail('CWD_UNSAFE');
  }
}

function cleanupWorkspace(workspace, fsImpl = fs) {
  if (!workspace || typeof workspace.path !== 'string') return { outcome: 'not_needed' };
  try {
    // Verify ancestor root FIRST before touching or checking workspace.path
    if (workspace.identity?.rootDev && workspace.identity?.rootIno && workspace.root) {
      let rootStat;
      try { rootStat = fsImpl.lstatSync(workspace.root, { bigint: true }); }
      catch { return { outcome: 'unconfirmed', error: createRoutingError('CLEANUP_UNCONFIRMED') }; }
      if (rootStat.isSymbolicLink() || !rootStat.isDirectory()
          || rootStat.dev.toString() !== String(workspace.identity.rootDev)
          || rootStat.ino.toString() !== String(workspace.identity.rootIno)) {
        return { outcome: 'unconfirmed', error: createRoutingError('CLEANUP_UNCONFIRMED') };
      }
      try {
        const realRoot = fsImpl.realpathSync.native(workspace.root);
        if (process.platform === 'win32') {
          if (realRoot.toLowerCase() !== path.resolve(workspace.root).toLowerCase()) {
            return { outcome: 'unconfirmed', error: createRoutingError('CLEANUP_UNCONFIRMED') };
          }
        } else {
          if (realRoot !== path.resolve(workspace.root)) {
            return { outcome: 'unconfirmed', error: createRoutingError('CLEANUP_UNCONFIRMED') };
          }
        }
      } catch {
        return { outcome: 'unconfirmed', error: createRoutingError('CLEANUP_UNCONFIRMED') };
      }
    }

    let stat;
    try { stat = fsImpl.lstatSync(workspace.path, { bigint: true }); } catch (statErr) {
      if (statErr?.code === 'ENOENT') return { outcome: 'confirmed' };
      return { outcome: 'unconfirmed', error: createRoutingError('CLEANUP_UNCONFIRMED') };
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      return { outcome: 'unconfirmed', error: createRoutingError('CLEANUP_UNCONFIRMED') };
    }
    if (workspace.identity) {
      if (stat.dev.toString() !== String(workspace.identity.dev) || stat.ino.toString() !== String(workspace.identity.ino)) {
        return { outcome: 'unconfirmed', error: createRoutingError('CLEANUP_UNCONFIRMED') };
      }
    }
    if (workspace.realpath) {
      try {
        const real = fsImpl.realpathSync.native(workspace.path);
        if (process.platform === 'win32') {
          if (real.toLowerCase() !== workspace.realpath.toLowerCase()) {
            return { outcome: 'unconfirmed', error: createRoutingError('CLEANUP_UNCONFIRMED') };
          }
        } else {
          if (real !== workspace.realpath) {
            return { outcome: 'unconfirmed', error: createRoutingError('CLEANUP_UNCONFIRMED') };
          }
        }
      } catch {
        return { outcome: 'unconfirmed', error: createRoutingError('CLEANUP_UNCONFIRMED') };
      }
    }
    safeRemoveTree(workspace.path, stat.dev.toString(), fsImpl);
    let finalDirStat;
    try {
      finalDirStat = fsImpl.lstatSync(workspace.path, { bigint: true });
    } catch {
      return { outcome: 'unconfirmed', error: createRoutingError('CLEANUP_UNCONFIRMED') };
    }
    if (finalDirStat.isSymbolicLink() || !finalDirStat.isDirectory()
        || (workspace.identity && (finalDirStat.dev.toString() !== String(workspace.identity.dev) || finalDirStat.ino.toString() !== String(workspace.identity.ino)))) {
      return { outcome: 'unconfirmed', error: createRoutingError('CLEANUP_UNCONFIRMED') };
    }
    fsImpl.rmdirSync(workspace.path);
    try {
      fsImpl.lstatSync(workspace.path);
      return { outcome: 'unconfirmed', error: createRoutingError('CLEANUP_UNCONFIRMED') };
    } catch (statError) {
      if (statError?.code === 'ENOENT') {
        return { outcome: 'confirmed' };
      }
      return {
        outcome: 'unconfirmed',
        error: isRoutingError(statError) ? statError : createRoutingError('CLEANUP_UNCONFIRMED')
      };
    }
  } catch (error) {
    return {
      outcome: 'unconfirmed',
      error: isRoutingError(error) ? error : createRoutingError('CLEANUP_UNCONFIRMED')
    };
  }
}

module.exports = { assertRoot, cleanupWorkspace, createWorkspace, rootFor, verifyWorkspace, safeRemoveTree };
