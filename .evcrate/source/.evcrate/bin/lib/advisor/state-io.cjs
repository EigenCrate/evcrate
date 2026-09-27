'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomBytes } = require('node:crypto');
const { createRoutingError } = require('./errors.cjs');
const { decodeUtf8, parseJsonDocument } = require('./json-document.cjs');
const {
  canonicalWindowsProjectRoot,
  resolveWindowsHome,
  canonicalWindowsProjectId,
  isUnsafeWindowsPath,
  getWindowsProcessIdentity,
  checkWindowsProcessStatus,
  readPinnedFileWindows,
  writePinnedFileWindows,
  verifyPinnedDirectoryWindows
} = require('./windows-platform.cjs');

const MAX_BYTES = 64 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const LOCATIONS = new WeakMap();
const NOFOLLOW = fs.constants.O_NOFOLLOW;
function fail(code = 'STATE_IO_FAILED') { throw createRoutingError(code); }
function inspect(file) {
  try { return fs.lstatSync(file, { bigint: true }); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function same(a, b) { return Boolean(a && b && a.dev === b.dev && a.ino === b.ino); }
function unchanged(a, b) {
  return same(a, b)
    && typeof a.isFile === 'function' && typeof b.isFile === 'function'
    && a.isFile() && b.isFile()
    && !a.isSymbolicLink() && !b.isSymbolicLink()
    && a.nlink === b.nlink
    && a.size === b.size
    && a.mtimeNs === b.mtimeNs;
}
function directory(stat) {
  if (!stat || !stat.isDirectory() || stat.isSymbolicLink()) fail();
}
function regular(stat) {
  if (!stat || !stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n) fail();
}
function absolute(value) {
  if (typeof value !== 'string' || value.includes('\0')) fail();
  if (process.platform === 'win32') {
    if (isUnsafeWindowsPath(value)) fail();
    const parts = value.split(path.sep);
    if (parts.some((part) => part === '.' || part === '..')) fail();
    return path.normalize(value);
  }
  if (!path.isAbsolute(value) || value.split(path.sep).some((part) => part === '.' || part === '..')) fail();
  return path.normalize(value);
}
function chain(root) {
  let current = path.parse(root).root;
  const entries = [];
  for (const component of ['', ...root.slice(current.length).split(path.sep).filter(Boolean)]) {
    if (component) current = path.join(current, component);
    const stat = inspect(current);
    directory(stat);
    entries.push({ path: current, stat });
  }
  if (fs.realpathSync.native(root) !== root) fail();
  return entries;
}
function stable(entries) {
  for (const entry of entries) {
    const stat = inspect(entry.path);
    directory(stat);
    if (!same(stat, entry.stat)) fail();
  }
}
function stateLocation({ cwd = process.cwd(), environment = process.env } = {}, taskRunId) {
  try {
    if (process.platform !== 'linux' && process.platform !== 'win32') fail('STATE_INVALID');
    if (process.platform === 'linux' && typeof NOFOLLOW !== 'number') fail('STATE_INVALID');
    if (typeof taskRunId !== 'string' || !UUID.test(taskRunId)) fail('STATE_INVALID');

    let projectRoot;
    let home;
    let projectId;

    if (process.platform === 'win32') {
      try {
        projectRoot = canonicalWindowsProjectRoot(cwd);
        home = resolveWindowsHome(environment);
        projectId = canonicalWindowsProjectId(projectRoot);
      } catch {
        fail('STATE_INVALID');
      }
    } else {
      projectRoot = absolute(cwd);
      home = absolute(environment.HOME);
      if (home === path.parse(home).root) fail();
      projectId = createHash('sha256').update(projectRoot).digest('hex');
    }

    const entries = [...chain(projectRoot), ...chain(home)];
    const parts = ['.evcrate', 'advisor-state', projectId, taskRunId.toLowerCase()];
    let current = home;
    let missing = false;
    for (const part of parts) {
      current = path.join(current, part);
      if (missing) continue;
      const stat = inspect(current);
      if (!stat) { missing = true; continue; }
      directory(stat);
      entries.push({ path: current, stat });
    }
    const location = Object.freeze({ projectId, projectRoot, taskDirectory: current });
    LOCATIONS.set(location, { home, parts, entries });
    return location;
  } catch (error) {
    if (error.name === 'AdvisorRoutingError') throw error;
    fail();
  }
}

function proc(pid) {
  if (process.platform !== 'linux') return null;
  try {
    const text = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    const end = text.lastIndexOf(')');
    const fields = text.slice(end + 2).trim().split(/\s+/u);
    return end >= 0 && /^\d+$/u.test(fields[19] || '') ? { start: fields[19], state: fields[0] } : null;
  } catch { return null; }
}
function processIdentity() {
  if (process.platform === 'win32') {
    return getWindowsProcessIdentity(process.pid);
  }
  return { pid: process.pid, start: proc(process.pid)?.start ?? null };
}
function validIdentity(identity) {
  return identity && typeof identity === 'object' && !Array.isArray(identity)
    && Object.keys(identity).length === 2 && Object.hasOwn(identity, 'pid') && Object.hasOwn(identity, 'start')
    && Number.isSafeInteger(identity.pid) && identity.pid > 0 && identity.pid <= 2147483647
    && (identity.start === null || (typeof identity.start === 'string' && /^\d{1,32}$/u.test(identity.start)));
}
function processStatus(identity) {
  if (!validIdentity(identity)) return 'unknown';
  if (process.platform === 'win32') {
    return checkWindowsProcessStatus(identity);
  }
  try { process.kill(identity.pid, 0); }
  catch (error) { return error.code === 'ESRCH' ? 'dead' : 'unknown'; }
  const current = proc(identity.pid);
  if (!current || identity.start === null) return 'unknown';
  if (current.start !== identity.start || current.state === 'Z' || current.state === 'X') return 'dead';
  return 'live';
}
// Pin each managed directory: /proc/self/fd supplies Linux's descriptor-relative
// lookup without following attacker-swapped ancestor paths during mutations.
function openTask(context, create) {
  stable(context.entries);
  if (process.platform === 'win32') {
    const descriptors = [];
    const entries = [...context.entries];
    let logical = context.home;
    try {
      let fd = fs.openSync(logical, fs.constants.O_RDONLY);
      descriptors.push(fd);
      if (!same(fs.fstatSync(fd, { bigint: true }), inspect(logical))) fail();
      for (const part of context.parts) {
        logical = path.join(logical, part);
        let stat = inspect(logical);
        if (!stat && create) {
          stable(entries);
          try { fs.mkdirSync(logical); }
          catch (error) { if (error.code !== 'EEXIST') throw error; }
          stat = inspect(logical);
        }
        if (!stat) fail('STATE_NOT_FOUND');
        directory(stat);
        const next = fs.openSync(logical, fs.constants.O_RDONLY);
        descriptors.push(next);
        if (!same(stat, fs.fstatSync(next, { bigint: true }))) fail();
        entries.push({ path: logical, stat });
      }
      stable(entries);
      return {
        entries,
        base: logical,
        close() { for (const item of descriptors.reverse()) try { fs.closeSync(item); } catch {} }
      };
    } catch (error) {
      for (const item of descriptors.reverse()) try { fs.closeSync(item); } catch {}
      throw error;
    }
  }
  const descriptors = [];
  const entries = [...context.entries];
  let logical = context.home;
  try {
    let fd = fs.openSync(logical, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | NOFOLLOW);
    descriptors.push(fd);
    if (!same(fs.fstatSync(fd, { bigint: true }), inspect(logical))) fail();
    for (const part of context.parts) {
      const child = `/proc/self/fd/${fd}/${part}`;
      let stat = inspect(child);
      if (!stat && create) {
        stable(entries);
        try { fs.mkdirSync(child); }
        catch (error) { if (error.code !== 'EEXIST') throw error; }
        fs.fsyncSync(fd);
        stat = inspect(child);
      }
      if (!stat) fail('STATE_NOT_FOUND');
      directory(stat);
      const next = fs.openSync(child, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | NOFOLLOW);
      descriptors.push(next);
      if (!same(stat, fs.fstatSync(next, { bigint: true }))) fail();
      logical = path.join(logical, part);
      entries.push({ path: logical, stat });
      fd = next;
    }
    stable(entries);
    return { fd, entries, base: `/proc/self/fd/${fd}`, close() { for (const item of descriptors.reverse()) fs.closeSync(item); } };
  } catch (error) {
    for (const fd of descriptors.reverse()) fs.closeSync(fd);
    throw error;
  }
}
function readFile(file, limit = MAX_BYTES) {
  const initial = inspect(file);
  if (!initial) return null;
  regular(initial);
  if (initial.size > BigInt(limit)) fail('STATE_INVALID');
  let fd;
  try {
    const flags = process.platform === 'win32'
      ? fs.constants.O_RDONLY
      : fs.constants.O_RDONLY | NOFOLLOW | fs.constants.O_NONBLOCK;
    fd = fs.openSync(file, flags);
    const opened = fs.fstatSync(fd, { bigint: true });
    regular(opened);
    if (!unchanged(initial, opened)) fail();
    const buffer = Buffer.alloc(Number(opened.size));
    let offset = 0;
    while (offset < buffer.length) {
      const length = fs.readSync(fd, buffer, offset, buffer.length - offset, offset);
      if (!length) fail();
      offset += length;
    }
    const final = fs.fstatSync(fd, { bigint: true });
    regular(final);
    if (!unchanged(opened, final) || !unchanged(final, inspect(file))) fail();
    return { stat: final, bytes: buffer };
  } finally { if (fd !== undefined) fs.closeSync(fd); }
}
function document(bytes, code = 'STATE_INVALID') {
  return parseJsonDocument(decodeUtf8(bytes, code), code, code);
}
function writeExclusive(file, bytes) {
  const flags = process.platform === 'win32'
    ? fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL
    : fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | NOFOLLOW;
  const fd = fs.openSync(file, flags);
  try {
    let offset = 0;
    while (offset < bytes.length) {
      const written = fs.writeSync(fd, bytes, offset, bytes.length - offset);
      if (!written) fail();
      offset += written;
    }
    fs.fsyncSync(fd);
    const stat = fs.fstatSync(fd, { bigint: true });
    regular(stat);
    if (!same(stat, inspect(file))) fail();
    return stat;
  } finally { fs.closeSync(fd); }
}
function lockRecord(file) {
  let record;
  try { record = readFile(file, 1024); }
  catch { fail('STATE_LOCKED'); }
  if (!record) fail('STATE_LOCKED');
  let value;
  try { value = document(record.bytes); } catch { fail('STATE_LOCKED'); }
  if (!value || Object.keys(value).length !== 2 || !validIdentity(value.process)
    || typeof value.token !== 'string' || !/^[a-f0-9]{32}$/u.test(value.token)) fail('STATE_LOCKED');
  return { ...record, value };
}
function removeOwned(file, stat) {
  const current = inspect(file);
  if (!current || !unchanged(current, stat)) fail('STATE_LOCKED');
  regular(current);
  try { fs.unlinkSync(file); }
  catch (error) { if (error.code === 'ENOENT') fail('STATE_LOCKED'); throw error; }
}
function acquire(task) {
  const file = `${task.base}/state.lock`;
  const recovery = `${task.base}/state-recovery.lock`;
  const value = { token: randomBytes(16).toString('hex'), process: processIdentity() };
  const bytes = Buffer.from(JSON.stringify(value));
  let stat;
  stable(task.entries);
  if (inspect(recovery)) fail('STATE_LOCKED');
  try { stat = writeExclusive(file, bytes); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const old = lockRecord(file);
    if (processStatus(old.value.process) !== 'dead') fail('STATE_LOCKED');
    let guard;
    try { guard = writeExclusive(recovery, bytes); }
    catch (guardError) { if (guardError.code === 'EEXIST') fail('STATE_LOCKED'); throw guardError; }
    // Serialize reapers, never rename/unlink a possibly replaced live lock.
    // A crash while reaping leaves an uncertain guard: fail closed, no TTL.
    try {
      stable(task.entries);
      const current = lockRecord(file);
      if (!unchanged(current.stat, old.stat) || current.value.token !== old.value.token
        || processStatus(current.value.process) !== 'dead') fail('STATE_LOCKED');
      removeOwned(file, current.stat);
      try { stat = writeExclusive(file, bytes); }
      catch (lockError) { if (lockError.code === 'EEXIST') fail('STATE_LOCKED'); throw lockError; }
    } finally { removeOwned(recovery, guard); if (task.fd !== undefined) fs.fsyncSync(task.fd); }
  }
  if (task.fd !== undefined) fs.fsyncSync(task.fd);
  return () => {
    stable(task.entries);
    const current = lockRecord(file);
    if (!unchanged(current.stat, stat) || current.value.token !== value.token) fail('STATE_LOCKED');
    removeOwned(file, stat);
    if (task.fd !== undefined) fs.fsyncSync(task.fd);
  };
}
function transactState(location, { create = false } = {}, callback) {
  let task;
  let release;
  try {
    const context = LOCATIONS.get(location);
    if (!context || typeof create !== 'boolean' || typeof callback !== 'function'
      || callback.constructor?.name === 'AsyncFunction') fail('STATE_INVALID');
    task = openTask(context, create);
    release = acquire(task);
    const file = `${task.base}/state.json`;
    const previous = readFile(file);
    if (!previous && !create) fail('STATE_NOT_FOUND');
    const current = previous ? document(previous.bytes) : null;
    if (previous && (!current || typeof current !== 'object' || Array.isArray(current))) fail('STATE_INVALID');
    const change = callback(current);
    if (!change || typeof change !== 'object' || typeof change.then === 'function'
      || Object.keys(change).length !== 2 || !Object.hasOwn(change, 'state') || !Object.hasOwn(change, 'result')) fail('STATE_INVALID');
    if (change.state !== null) {
      if (!change.state || typeof change.state !== 'object' || Array.isArray(change.state)) fail('STATE_INVALID');
      const text = JSON.stringify(change.state);
      if (typeof text !== 'string' || Buffer.byteLength(text) > MAX_BYTES) fail('STATE_INVALID');
      document(Buffer.from(text));
      const bytes = Buffer.from(text);
      stable(task.entries);
      if (process.platform === 'win32') {
        const now = readFile(file);
        if (previous ? !now || !unchanged(now.stat, previous.stat) || !now.bytes.equals(previous.bytes) : now !== null) fail('STATE_CONFLICT');
        const expectedDigest = previous ? createHash('sha256').update(previous.bytes).digest('hex') : null;
        const res = writePinnedFileWindows(file, bytes, {
          replaceIfExists: Boolean(previous),
          expectedDev: previous?.stat?.dev?.toString() ?? null,
          expectedIno: previous?.stat?.ino?.toString() ?? null,
          expectedDigest
        });
        if (res.status === 'conflict') fail('STATE_CONFLICT');
        if (res.status !== 'ok') fail();
        stable(task.entries);
      } else {
        const temporary = `${task.base}/.state-${randomBytes(16).toString('hex')}.tmp`;
        let temporaryStat;
        try {
          temporaryStat = writeExclusive(temporary, bytes);
          stable(task.entries);
          const now = readFile(file);
          if (previous ? !now || !unchanged(now.stat, previous.stat) || !now.bytes.equals(previous.bytes) : now !== null) fail('STATE_CONFLICT');
          if (!unchanged(inspect(temporary), temporaryStat)) fail();
          if (!previous) {
            // No-replace creation: never clobber a file introduced after the check.
            try {
              fs.linkSync(temporary, file);
            } catch (linkError) {
              if (linkError.code === 'EEXIST') fail('STATE_CONFLICT');
              throw linkError;
            }
            try {
              fs.unlinkSync(temporary);
              temporaryStat = undefined;
            } catch (unlinkError) {
              temporaryStat = undefined;
              throw unlinkError;
            }
          } else {
            fs.renameSync(temporary, file);
            temporaryStat = undefined;
          }
          if (task.fd !== undefined) fs.fsyncSync(task.fd);
          stable(task.entries);
        } finally { if (temporaryStat) removeOwned(temporary, temporaryStat); }
      }
    }
    return change.result;
  } catch (error) {
    if (error.name === 'AdvisorRoutingError') throw error;
    fail();
  } finally {
    try {
      try { if (release) release(); }
      finally { if (task) task.close(); }
    } catch (error) {
      if (error.name === 'AdvisorRoutingError') throw error;
      fail();
    }
  }
}

module.exports = {
  stateLocation, transactState, processIdentity, processStatus,
  inspect, same, unchanged, directory, regular, absolute, chain, stable,
  readFile, writeExclusive, removeOwned, openTask, NOFOLLOW, UUID, LOCATIONS
};
