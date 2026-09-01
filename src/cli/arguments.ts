import { ControlPlaneError } from '../errors/control-plane-error.js';
import { normalizeTarget, PROTOCOL_VERSION } from '../protocol/validation.js';
import type { PersistedTarget } from '../protocol/validation.js';

export const MAX_CLI_TIMEOUT_MS = 900_000;

export type CliCommand =
  | { readonly kind: 'version' }
  | { readonly kind: 'health' }
  | { readonly kind: 'advisor-settings'; readonly operation: 'get' | 'preview' | 'apply' }
  | { readonly kind: 'distribute'; readonly action: 'build' | 'check' | 'publish' | 'all' | 'recover' }
  | { readonly kind: 'resources'; readonly action: 'list' | 'get' }
  | { readonly kind: 'imports'; readonly action: 'preview' | 'apply' }
  | { readonly kind: 'scopes'; readonly action: 'list' | 'get' | 'assign' | 'remove' | 'enable' | 'disable' }
  | { readonly kind: 'changes'; readonly action: 'preview' | 'apply' }
  | { readonly kind: 'request-file' };

export interface CliOptions {
  readonly source?: string;
  readonly home?: string;
  readonly stateHome?: string;
  readonly projectId?: string;
  readonly projectRoot?: string;
  readonly targets: readonly PersistedTarget[];
  readonly id?: string;
  readonly kind?: string;
  readonly importSource?: string;
  readonly destination?: string;
  readonly provenance?: string;
  readonly approveCapabilities: readonly string[];
  readonly previewToken?: string;
  readonly mutation?: string;
  readonly expectedRevision?: string;
  readonly expirySeconds?: string;
  readonly limit?: string;
  readonly cursor?: string;
  readonly requestFile?: string;
  readonly json: boolean;
  readonly protocolVersion: 1;
  readonly timeoutMs: number;
}

export interface CliInvocation {
  readonly command: CliCommand;
  readonly options: CliOptions;
}

const VALUE_OPTIONS = new Set([
  '--source', '--home', '--state-home', '--project-id', '--project-root', '--target',
  '--id', '--kind', '--import-source', '--destination', '--provenance', '--approve-capability',
  '--preview-token', '--mutation', '--expected-revision', '--expiry', '--limit', '--cursor', '--request-file', '--protocol-version', '--timeout'
]);
const SCALAR_OPTIONS = new Set([...VALUE_OPTIONS].filter((option) => option !== '--target' && option !== '--approve-capability'));

function fail(code: 'USAGE_INVALID' | 'PROTOCOL_INVALID' | 'VALIDATION_INVALID'): never {
  throw new ControlPlaneError(code);
}

function optionValue(argv: readonly string[], index: number, option: string): [string, number] {
  const token = argv[index];
  const equals = token.indexOf('=');
  if (equals >= 0) {
    const inline = token.slice(equals + 1);
    if (!inline) fail('USAGE_INVALID');
    return [inline, index];
  }
  const next = argv[index + 1];
  if (next === undefined || next.startsWith('--') || next.length === 0) fail('USAGE_INVALID');
  return [next, index + 1];
}

function boundedInteger(value: string, max: number): number {
  if (!/^\d+$/u.test(value)) fail('VALIDATION_INVALID');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > max) fail('VALIDATION_INVALID');
  return parsed;
}

function protocolInteger(value: string): number {
  if (!/^\d+$/u.test(value)) fail('PROTOCOL_INVALID');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) fail('PROTOCOL_INVALID');
  return parsed;
}
function commandFromPositionals(positionals: readonly string[], hasRequestFile: boolean): CliCommand {
  if (hasRequestFile) {
    if (positionals.length === 0) return { kind: 'request-file' };
    if (positionals.length === 3 && positionals[0] === 'advisor' && positionals[1] === 'settings'
      && ['get', 'preview', 'apply'].includes(positionals[2])) {
      return { kind: 'advisor-settings', operation: positionals[2] as 'get' | 'preview' | 'apply' };
    }
    fail('USAGE_INVALID');
  }
  if (positionals.length === 1 && positionals[0] === 'version') return { kind: 'version' };
  if (positionals.length === 1 && positionals[0] === 'health') return { kind: 'health' };
  if (positionals.length === 3 && positionals[0] === 'advisor' && positionals[1] === 'settings'
    && ['get', 'preview', 'apply'].includes(positionals[2])) {
    return { kind: 'advisor-settings', operation: positionals[2] as 'get' | 'preview' | 'apply' };
  }
  if (positionals.length === 2 && positionals[0] === 'distribute'
    && ['build', 'check', 'publish', 'all', 'recover'].includes(positionals[1])) {
    return { kind: 'distribute', action: positionals[1] as 'build' | 'check' | 'publish' | 'all' | 'recover' };
  }
  if (positionals.length === 2 && positionals[0] === 'resources'
    && ['list', 'get'].includes(positionals[1])) {
    return { kind: 'resources', action: positionals[1] as 'list' | 'get' };
  }
  if (positionals.length === 2 && positionals[0] === 'imports'
    && ['preview', 'apply'].includes(positionals[1])) {
    return { kind: 'imports', action: positionals[1] as 'preview' | 'apply' };
  }
  if (positionals.length === 2 && positionals[0] === 'scopes'
    && ['list', 'get', 'assign', 'remove', 'enable', 'disable'].includes(positionals[1])) {
    return { kind: 'scopes', action: positionals[1] as 'list' | 'get' | 'assign' | 'remove' | 'enable' | 'disable' };
  }
  if (positionals.length === 2 && positionals[0] === 'changes'
    && ['preview', 'apply'].includes(positionals[1])) {
    return { kind: 'changes', action: positionals[1] as 'preview' | 'apply' };
  }
  fail('USAGE_INVALID');
}

export function parseArguments(argv: readonly string[]): CliInvocation {
  const positionals: string[] = [];
  const targets: PersistedTarget[] = [];
  const approvals: string[] = [];
  const values: Record<string, string> = {};
  let json = false;
  const seen = new Set<string>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      if (!token) fail('USAGE_INVALID');
      positionals.push(token);
      continue;
    }
    if (token === '--json') {
      if (json) fail('USAGE_INVALID');
      json = true;
      continue;
    }
    const equals = token.indexOf('=');
    const option = equals < 0 ? token : token.slice(0, equals);
    if (!VALUE_OPTIONS.has(option)) fail('USAGE_INVALID');
    if (SCALAR_OPTIONS.has(option) && seen.has(option)) fail('USAGE_INVALID');
    if (SCALAR_OPTIONS.has(option)) seen.add(option);
    const [value, nextIndex] = optionValue(argv, index, option);
    index = nextIndex;
    if (option === '--target') {
      let target: PersistedTarget;
      try { target = normalizeTarget(value); } catch { throw new ControlPlaneError('CAPABILITY_UNSUPPORTED'); }
      if (targets.includes(target)) fail('VALIDATION_INVALID');
      targets.push(target);
    } else if (option === '--approve-capability') {
      if (approvals.includes(value)) fail('VALIDATION_INVALID');
      approvals.push(value);
    } else if (option === '--protocol-version') {
      if (protocolInteger(value) !== PROTOCOL_VERSION) fail('PROTOCOL_INVALID');
    } else if (option === '--timeout') {
      values.timeoutMs = value;
    } else {
      values[option.slice(2).replaceAll('-', '')] = value;
    }
  }
  const command = commandFromPositionals(positionals, values.requestfile !== undefined);
  const timeoutMs = values.timeoutMs === undefined
    ? MAX_CLI_TIMEOUT_MS : boundedInteger(values.timeoutMs, MAX_CLI_TIMEOUT_MS);
  const options: CliOptions = Object.freeze({
    source: values.source,
    home: values.home,
    stateHome: values.statehome,
    projectId: values.projectid,
    projectRoot: values.projectroot,
    targets: Object.freeze([...targets]),
    id: values.id,
    kind: values.kind,
    importSource: values.importsource,
    destination: values.destination,
    provenance: values.provenance,
    approveCapabilities: Object.freeze([...approvals]),
    previewToken: values.previewtoken,
    mutation: values.mutation,
    expectedRevision: values.expectedrevision,
    expirySeconds: values.expiry,
    limit: values.limit,
    cursor: values.cursor,
    requestFile: values.requestfile,
    json,
    protocolVersion: 1,
    timeoutMs
  });
  return Object.freeze({ command, options });
}
