'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { createRoutingError } = require('./errors.cjs');
const { decodeUtf8 } = require('./json-document.cjs');

const MAX_PATHS = 32;
const MAX_FILE_BYTES = 16 * 1024 * 1024;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
const MAX_RECORD_BYTES = 48 * 1024;
function fail(code = 'STATE_IO_FAILED') { throw createRoutingError(code); }
function relative(value, code = 'STATE_INVALID') {
  if (typeof value !== 'string' || !value || Buffer.byteLength(value) > 512
    || /[\\:\u0000-\u001f\u007f]/u.test(value) || path.isAbsolute(value)
    || value.split('/').some((part) => !part || part === '.' || part === '..')) fail(code);
  return value;
}
function inspect(file) {
  try { return fs.lstatSync(file, { bigint: true }); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function same(a, b) { return a && b && a.dev === b.dev && a.ino === b.ino; }
function unchanged(a, b) { return same(a, b) && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs; }
function directory(stat) { if (!stat || !stat.isDirectory() || stat.isSymbolicLink()) fail(); }
function regular(stat) {
  if (!stat || !stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n) fail();
}
function rootChain(root) {
  if (typeof root !== 'string' || !path.isAbsolute(root) || path.normalize(root) !== root
    || root.includes('\0') || typeof fs.constants.O_NOFOLLOW !== 'number' || process.platform !== 'linux') fail();
  let current = path.parse(root).root;
  const entries = [];
  for (const component of ['', ...root.slice(current.length).split(path.sep).filter(Boolean)]) {
    if (component) current = path.join(current, component);
    const stat = inspect(current);
    directory(stat);
    entries.push({ file: current, stat });
  }
  if (fs.realpathSync.native(root) !== root) fail();
  return entries;
}
function stable(entries) {
  for (const entry of entries) {
    const current = inspect(entry.file);
    directory(current);
    if (!same(current, entry.stat) || current.mode !== entry.stat.mode || current.uid !== entry.stat.uid) fail();
  }
}
function captureFile(root, selected, roots, budget, observations) {
  stable(roots);
  const descriptors = [];
  const entries = [...roots];
  let logical = root;
  try {
    let fd = fs.openSync(root, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
    descriptors.push(fd);
    if (!same(fs.fstatSync(fd, { bigint: true }), inspect(root))) fail();
    const parts = selected.split('/');
    for (const part of parts.slice(0, -1)) {
      const child = `/proc/self/fd/${fd}/${part}`;
      const stat = inspect(child);
      if (!stat) {
        stable(entries);
        observations.push({ file: path.join(logical, part), stat: null, entries });
        return { path: selected, digest: null, status: 'missing' };
      }
      directory(stat);
      const next = fs.openSync(child, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
      descriptors.push(next);
      if (!same(stat, fs.fstatSync(next, { bigint: true }))) fail();
      logical = path.join(logical, part);
      entries.push({ file: logical, stat });
      fd = next;
    }
    const file = `/proc/self/fd/${fd}/${parts.at(-1)}`;
    const initial = inspect(file);
    if (!initial) {
      stable(entries);
      observations.push({ file: path.join(logical, parts.at(-1)), stat: null, entries });
      return { path: selected, digest: null, status: 'missing' };
    }
    regular(initial);
    if (initial.size > BigInt(MAX_FILE_BYTES) || initial.size > BigInt(budget.remaining)) fail('STATE_INVALID');
    const input = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    descriptors.push(input);
    const opened = fs.fstatSync(input, { bigint: true });
    regular(opened);
    if (!unchanged(initial, opened)) fail();
    const hash = createHash('sha256');
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let total = 0;
    while (total < Number(opened.size)) {
      const count = fs.readSync(input, buffer, 0, Math.min(buffer.length, Number(opened.size) - total), total);
      if (!count) fail();
      total += count;
      hash.update(buffer.subarray(0, count));
    }
    const final = fs.fstatSync(input, { bigint: true });
    regular(final);
    if (!unchanged(opened, final) || !unchanged(final, inspect(file))) fail();
    stable(entries);
    budget.remaining -= total;
    observations.push({ file: path.join(logical, parts.at(-1)), stat: final, entries });
    return { path: selected, digest: hash.digest('hex'), status: 'file' };
  } finally { for (const fd of descriptors.reverse()) fs.closeSync(fd); }
}
function gitEnvironment() {
  const environment = { ...process.env };
  for (const name of Object.keys(environment)) if (name.startsWith('GIT_')) delete environment[name];
  return { ...environment, GIT_OPTIONAL_LOCKS: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', LC_ALL: 'C' };
}
function git(root, args, environment) {
  const result = spawnSync('git', ['--literal-pathspecs', '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false', '-c', 'safe.directory=*', '-C', root, ...args], {
    env: environment, timeout: 5000, maxBuffer: 64 * 1024, windowsHide: true
  });
  if (result.error || result.signal || result.status !== 0) fail();
  return decodeUtf8(result.stdout, 'STATE_IO_FAILED');
}
function repository(root) {
  for (let current = root;; current = path.dirname(current)) {
    const marker = inspect(path.join(current, '.git'));
    if (marker) {
      if (marker.isSymbolicLink() || (!marker.isDirectory() && !marker.isFile())
        || (marker.isFile() && marker.nlink !== 1n)) fail();
      return current;
    }
    if (path.dirname(current) === current) return null;
  }
}
function gitRecords(root, paths, environment) {
  const repo = repository(root);
  if (!repo) return new Map(paths.map((selected) => [selected, null]));
  const prefix = path.relative(repo, root).split(path.sep).join('/');
  const byGitPath = new Map(paths.map((selected) => [prefix ? `${prefix}/${selected}` : selected, selected]));
  const records = new Map(paths.map((selected) => [selected, { status: '  ', identity: null, original_path: null }]));
  const indices = new Map(paths.map((selected) => [selected, []]));
  const indexAddsOrDeletes = new Set();
  const stages = git(root, ['ls-files', '--stage', '-z', '--', ...paths], environment);
  for (const entry of stages.split('\0').filter(Boolean)) {
    const match = /^(\d{6} [a-f0-9]{40,64} [0-3])\t(.+)$/u.exec(entry);
    // ls-files is relative to cwd, unlike porcelain-v2 status paths.
    if (!match || !indices.has(match[2])) fail();
    indices.get(match[2]).push(match[1]);
  }
  const fields = git(root, ['status', '--porcelain=v2', '-z', '--no-renames', '--untracked-files=all', '--ignored=traditional', '--ignore-submodules=all', '--', ...paths], environment).split('\0');
  for (let index = 0; index < fields.length; index += 1) {
    const entry = fields[index];
    if (!entry) continue;
    if (entry.startsWith('? ') || entry.startsWith('! ')) {
      const selected = byGitPath.get(entry.slice(2));
      if (!selected) fail();
      records.get(selected).status = entry[0].repeat(2);
      continue;
    }
    const count = entry[0] === '1' ? 8 : entry[0] === '2' ? 9 : entry[0] === 'u' ? 10 : 0;
    if (!count) fail();
    let separator = -1;
    for (let part = 0; part < count; part += 1) separator = entry.indexOf(' ', separator + 1);
    if (separator < 0) fail();
    const selected = byGitPath.get(entry.slice(separator + 1));
    if (!selected) fail();
    if (entry[2] === 'A' || entry[2] === 'D') indexAddsOrDeletes.add(selected);
    const record = records.get(selected);
    record.status = entry.slice(2, 4).replaceAll('.', ' ');
    record.identity = entry.slice(0, separator);
    if (entry[0] === '2') {
      const source = fields[++index];
      relative(source, 'STATE_IO_FAILED');
      // Rename identity is repo-relative; it is metadata, never a read target.
      record.original_path = source;
    }
  }
  if (indexAddsOrDeletes.size > 0 || [...records.values()].some((record) => /^[AD]/u.test(record.status))) {
    // Pathspec-limited status loses a rename whose other endpoint is unselected.
    // Discover only staged metadata globally; never open the other worktree path.
    // Run this bounded query only when selected index additions/deletions need it.
    const changes = git(repo, ['diff', '--cached', '--raw', '-z', '--no-abbrev', '--find-renames', '--no-ext-diff', '--no-textconv', '--ignore-submodules=all', '--'], environment).split('\0');
    for (let index = 0; index < changes.length; index += 1) {
      const header = changes[index];
      if (!header) continue;
      const match = /^:\d{6} \d{6} [a-f0-9]{40,64} [a-f0-9]{40,64} ([A-Z])\d*$/u.exec(header);
      if (!match || !changes[index + 1]) fail();
      const source = changes[++index];
      if (match[1] !== 'R') continue;
      const destination = changes[++index];
      if (!destination) fail();
      const endpoints = [byGitPath.get(source), byGitPath.get(destination)].filter(Boolean);
      if (!endpoints.length) continue;
      relative(source, 'STATE_IO_FAILED');
      relative(destination, 'STATE_IO_FAILED');
      // Bind both endpoint names, including source-only destination retargeting,
      // without widening the persisted paths or the selected content-read set.
      const linkage = createHash('sha256').update(`${header}\0${source}\0${destination}`).digest('hex');
      for (const selected of endpoints) {
        const record = records.get(selected);
        const secondChar = record.status[1];
        const validSecond = (secondChar && /[ MADRCUT]/u.test(secondChar)) ? secondChar : ' ';
        record.status = `R${validSecond}`;
        record.original_path = source;
        record.identity = `${record.identity || ''}|${linkage}`;
      }
    }
  }
  for (const selected of paths) {
    const record = records.get(selected);
    const stage = indices.get(selected).sort().join(';');
    record.identity = record.identity === null && !stage ? null : `${record.identity || ''}|${stage}`;
  }
  return records;
}
function keys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Object.keys(value).length !== expected.length || expected.some((key) => !Object.hasOwn(value, key))) fail('STATE_INVALID');
}
function validateBaseline(records) {
  if (!Array.isArray(records) || records.length > MAX_PATHS) fail('STATE_INVALID');
  let previous = null;
  for (const record of records) {
    keys(record, ['path', 'digest', 'status', 'git']);
    relative(record.path);
    if (previous !== null && previous >= record.path) fail('STATE_INVALID');
    previous = record.path;
    if (record.status === 'missing' ? record.digest !== null
      : record.status !== 'file' || typeof record.digest !== 'string' || !/^[a-f0-9]{64}$/u.test(record.digest)) fail('STATE_INVALID');
    if (record.git !== null) {
      keys(record.git, ['status', 'identity', 'original_path']);
      if (typeof record.git.status !== 'string' || !/^(?:[ MADRCUT]{2}|\?\?|!!)$/u.test(record.git.status)) fail('STATE_INVALID');
      if (record.git.identity !== null && (typeof record.git.identity !== 'string'
        || !record.git.identity || Buffer.byteLength(record.git.identity) > 2048
        || !/^[a-zA-Z0-9 .;|]+$/u.test(record.git.identity))) fail('STATE_INVALID');
      if (record.git.original_path !== null) relative(record.git.original_path);
    }
  }
  if (Buffer.byteLength(JSON.stringify(records)) > MAX_RECORD_BYTES) fail('STATE_INVALID');
  return records;
}
function captureBaseline(projectRoot, paths) {
  try {
    if (!Array.isArray(paths) || paths.length > MAX_PATHS) fail('STATE_INVALID');
    const selected = paths.map((item) => relative(item)).sort();
    if (new Set(selected).size !== selected.length) fail('STATE_INVALID');
    const roots = rootChain(projectRoot);
    if (!selected.length) return [];
    const environment = gitEnvironment();
    const before = gitRecords(projectRoot, selected, environment);
    const observations = [];
    const budget = { remaining: MAX_TOTAL_BYTES };
    const records = selected.map((item) => ({ ...captureFile(projectRoot, item, roots, budget, observations), git: before.get(item) }));
    const after = gitRecords(projectRoot, selected, environment);
    stable(roots);
    for (const observation of observations) {
      stable(observation.entries);
      const now = inspect(observation.file);
      if (observation.stat ? !unchanged(observation.stat, now) : now !== null) fail('STALE_EVIDENCE_REVISION');
    }
    if (JSON.stringify([...before]) !== JSON.stringify([...after])) fail('STALE_EVIDENCE_REVISION');
    return validateBaseline(records);
  } catch (error) {
    if (error.name === 'AdvisorRoutingError') throw error;
    fail();
  }
}
function assertBaselineFresh(projectRoot, records) {
  validateBaseline(records);
  const current = captureBaseline(projectRoot, records.map((record) => record.path));
  for (const [index, record] of records.entries()) {
    const observed = current[index];
    if (record.path !== observed.path || record.digest !== observed.digest || record.status !== observed.status
      || (record.git === null) !== (observed.git === null)
      || (record.git !== null && ['status', 'identity', 'original_path'].some((key) => record.git[key] !== observed.git[key]))) fail('STALE_EVIDENCE_REVISION');
  }
  return records;
}

module.exports = { captureBaseline, assertBaselineFresh, validateBaseline };
