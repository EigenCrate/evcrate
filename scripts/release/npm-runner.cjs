'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

/**
 * Resolves the cross-platform invocation command and prefix arguments for npm.
 * On Win32, prefers invoking Node with npm-cli.js directly (zero shell overhead,
 * immune to cmd.exe metacharacter splitting / injection), falling back to cmd.exe
 * when npm-cli.js cannot be located alongside Node.
 * On POSIX, returns direct npm binary execution.
 *
 * @returns {{ command: string, prefixArgs: string[] }}
 */
function resolveNpmInvocation() {
  if (process.platform === 'win32') {
    const nodeDir = path.dirname(process.execPath);
    const npmCli = path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js');
    if (fs.existsSync(npmCli)) {
      return { command: process.execPath, prefixArgs: [npmCli] };
    }
    const cmd = process.env.ComSpec || 'cmd.exe';
    return { command: cmd, prefixArgs: ['/d', '/s', '/c', 'npm'] };
  }
  return { command: 'npm', prefixArgs: [] };
}

/**
 * Executes npm synchronously cross-platform.
 *
 * @param {string[]} args - npm arguments (e.g. ['run', 'build:all'])
 * @param {import('node:child_process').ExecFileSyncOptions} [options={}] - child_process options
 * @returns {Buffer | string} stdout from execFileSync
 */
function execNpmSync(args, options = {}) {
  const { command, prefixArgs } = resolveNpmInvocation();
  return execFileSync(command, [...prefixArgs, ...args], options);
}

/**
 * Spawns npm synchronously cross-platform returning the spawn result object.
 *
 * @param {string[]} args - npm arguments
 * @param {import('node:child_process').SpawnSyncOptions} [options={}] - spawnSync options
 * @returns {import('node:child_process').SpawnSyncReturns<Buffer | string>}
 */
function spawnNpmSync(args, options = {}) {
  const { command, prefixArgs } = resolveNpmInvocation();
  return spawnSync(command, [...prefixArgs, ...args], options);
}

module.exports = {
  execNpmSync,
  spawnNpmSync,
  resolveNpmInvocation
};
