'use strict';

/**
 * @file closure-policy.cjs
 * Approved and forbidden built-ins and specifier rules for plugin runtime closure (Phase E04).
 */

const APPROVED_NODE_BUILTINS = new Set([
  'node:buffer',
  'node:crypto',
  'node:events',
  'node:fs',
  'node:module',
  'node:path',
  'node:process',
  'node:stream',
  'node:string_decoder',
  'node:util'
]);

const FORBIDDEN_NODE_BUILTINS = new Set([
  'node:child_process',
  'node:cluster',
  'node:dgram',
  'node:dns',
  'node:http',
  'node:http2',
  'node:https',
  'node:inspector',
  'node:net',
  'node:os',
  'node:perf_hooks',
  'node:readline',
  'node:repl',
  'node:tls',
  'node:trace_events',
  'node:tty',
  'node:v8',
  'node:vm',
  'node:wasi',
  'node:worker_threads',
  'node:zlib'
]);

module.exports = {
  APPROVED_NODE_BUILTINS,
  FORBIDDEN_NODE_BUILTINS
};
