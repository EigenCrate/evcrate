'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRoutingError, isRoutingError } = require('./errors.cjs');

function fail(code = 'CWD_UNSAFE') { throw createRoutingError(code); }
function uid(stat) { return typeof process.getuid === 'function' ? process.getuid() : stat.uid; }
function rootFor(environment = process.env, tempDirectory = os.tmpdir) {
  const value = environment?.TMPDIR || tempDirectory();
  if (typeof value !== 'string' || !value || !path.isAbsolute(value) || value.includes('\0')) fail('CWD_UNSAFE');
  return path.normalize(value);
}
function assertRoot(root) {
  let stat;
  try { stat = fs.lstatSync(root); } catch { fail('CWD_UNSAFE'); }
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail('CWD_UNSAFE');
  try { if (fs.realpathSync.native(root) !== path.resolve(root)) fail('CWD_UNSAFE'); }
  catch { fail('CWD_UNSAFE'); }
  return stat;
}
function verifyWorkspace(workspace) {
  if (!workspace || typeof workspace.path !== 'string') fail('CWD_UNSAFE');
  let stat;
  try { stat = fs.lstatSync(workspace.path); } catch { fail('CWD_UNSAFE'); }
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== uid(stat)) fail('CWD_UNSAFE');
  if (fs.realpathSync.native(workspace.path) !== workspace.realpath) fail('CWD_UNSAFE');
  if (fs.readdirSync(workspace.path).length !== 0) fail('CWD_UNSAFE');
  return workspace;
}
function createWorkspace({ environment = process.env, tempDirectory = os.tmpdir, fsImpl = fs } = {}) {
  const root = rootFor(environment, tempDirectory);
  assertRoot(root);
  let directory;
  try { directory = fsImpl.mkdtempSync(path.join(root, 'evcrate-advisor-')); }
  catch { fail('CWD_UNSAFE'); }
  try {
    fsImpl.chmodSync(directory, 0o700);
    const workspace = Object.freeze({
      path: directory,
      realpath: fsImpl.realpathSync.native(directory),
      root
    });
    verifyWorkspace(workspace);
    return workspace;
  } catch (error) {
    try { fsImpl.rmSync(directory, { recursive: true, force: true }); } catch { /* best effort */ }
    if (error.name === 'AdvisorRoutingError') throw error;
    fail('CWD_UNSAFE');
  }
}
function cleanupWorkspace(workspace, fsImpl = fs) {
  if (!workspace || typeof workspace.path !== 'string') return { outcome: 'not_needed' };
  try {
    fsImpl.rmSync(workspace.path, { recursive: true, force: true });
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

module.exports = { assertRoot, cleanupWorkspace, createWorkspace, rootFor, verifyWorkspace };
