import { spawnSync } from 'node:child_process';
import process from 'node:process';
import {
  DamHopperClientError,
  DamHopperConflictError,
  detectCounselFields
} from './dam-hopper-errors.mjs';
import {
  buildChangesApplyArgs,
  buildChangesPreviewArgs,
  buildImportsApplyArgs,
  buildImportsPreviewArgs,
  buildPublishArgs,
  buildRecoverArgs,
  buildResourcesGetArgs,
  buildResourcesListArgs,
  buildScopesAssignArgs,
  buildScopesGetArgs,
  buildScopesMutationArgs
} from './dam-hopper-commands.mjs';

const MAX_BUFFER = 10 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;

export class DamHopperSubprocessClient {
  constructor({
    cliPath, execPath = process.execPath, cwd, projectRoot, projectId = null,
    home = null, stateHome = null, source = null, targets = [], timeoutMs = DEFAULT_TIMEOUT_MS, env = {}
  }) {
    if (!cliPath) throw new DamHopperClientError('cliPath is required', { code: 'CONFIG_INVALID' });
    this.cliPath = cliPath;
    this.execPath = execPath;
    this.cwd = cwd ?? process.cwd();
    this.projectRoot = projectRoot ?? this.cwd;
    this.projectId = projectId;
    this.home = home;
    this.stateHome = stateHome;
    this.source = source;
    this.targets = Object.freeze([...targets]);
    this.timeoutMs = timeoutMs;
    this.env = Object.freeze({
      PATH: process.env.PATH ?? '',
      NODE_PATH: process.env.NODE_PATH ?? '',
      HOME: home ?? process.env.HOME ?? '',
      ...env
    });
  }

  buildBaseArgs({ targets = null, projectId = null, home = null, stateHome = null, source = null } = {}) {
    const args = ['--json'];
    const activeTargets = targets ?? this.targets;
    for (const target of activeTargets) args.push('--target', target);
    if (this.projectRoot) args.push('--project-root', this.projectRoot);
    const activeProjectId = projectId ?? this.projectId;
    if (activeProjectId) args.push('--project-id', activeProjectId);
    const activeHome = home ?? this.home;
    if (activeHome) args.push('--home', activeHome);
    const activeState = stateHome ?? this.stateHome;
    if (activeState) args.push('--state-home', activeState);
    const activeSource = source ?? this.source;
    if (activeSource) args.push('--source', activeSource);
    return args;
  }

  invoke(subcommandArgs, { stdin = null, timeoutMs = null, customEnv = {} } = {}) {
    const hasTargetInSubcommand = subcommandArgs.includes('--target');
    const baseArgs = this.buildBaseArgs(hasTargetInSubcommand ? { targets: [] } : {});
    const args = [...baseArgs, ...subcommandArgs];
    const isJs = this.cliPath.endsWith('.js') || this.cliPath.endsWith('.cjs') || this.cliPath.endsWith('.mjs');
    const spawnExe = isJs ? this.execPath : this.cliPath;
    const spawnArgs = isJs ? [this.cliPath, ...args] : args;

    const result = spawnSync(spawnExe, spawnArgs, {
      cwd: this.cwd,
      env: { ...this.env, ...customEnv },
      input: stdin ?? undefined,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: timeoutMs ?? this.timeoutMs,
      maxBuffer: MAX_BUFFER
    });

    if (result.error) {
      if (result.error.code === 'ETIMEDOUT') {
        throw new DamHopperClientError('Subprocess execution timed out', {
          code: 'TIMEOUT', category: 'timeout', action: 'Increase timeout or reduce request complexity.'
        });
      }
      throw new DamHopperClientError(`Subprocess spawn failed: ${result.error.message}`, {
        code: 'SPAWN_FAILED', category: 'process', details: result.error
      });
    }

    if (result.stderr && result.stderr.trim().length > 0) {
      const isCleanStderr = !result.stderr.includes('Error:') && !result.stderr.includes('Traceback');
      if (!isCleanStderr && result.status !== 0 && !result.stdout?.trim()) {
        throw new DamHopperClientError(`Subprocess error output: ${result.stderr.trim()}`, {
          code: 'SUBPROCESS_FAILED', category: 'process', details: { stderr: result.stderr }
        });
      }
    }

    return this.parseEnvelope(result.stdout, result.status);
  }

  parseEnvelope(stdout, status) {
    const raw = stdout?.trim();
    if (!raw) {
      throw new DamHopperClientError('Subprocess returned empty output', {
        code: 'EMPTY_OUTPUT', category: 'protocol', details: { status }
      });
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new DamHopperClientError(`Malformed JSON response from CLI: ${err.message}`, {
        code: 'MALFORMED_ENVELOPE', category: 'protocol', details: { raw, parseError: err.message }
      });
    }

    if (detectCounselFields(parsed)) {
      throw new DamHopperClientError('Counsel or checkpoint fields detected in response envelope', {
        code: 'COUNSEL_PROXY_FORBIDDEN', category: 'security', action: 'Do not route advisor counsel through resource control.'
      });
    }

    if (parsed.status === 'conflict') {
      throw new DamHopperConflictError(parsed.error?.message ?? 'CAS revision conflict', {
        conflict: parsed.conflict, details: parsed
      });
    }

    if (parsed.status === 'error') {
      throw new DamHopperClientError(parsed.error?.message ?? 'Command returned error status', {
        code: parsed.error?.code ?? 'CONTROL_PLANE_ERROR',
        category: parsed.error?.category ?? 'control_plane',
        action: parsed.error?.action ?? 'Check error details and retry.',
        details: parsed
      });
    }

    if (parsed.protocol === 'evcrate-advisor-diagnostic') {
      if (parsed.protocolVersion !== 1) {
        throw new DamHopperClientError(`Unsupported diagnostic protocol version: ${parsed.protocolVersion}`, {
          code: 'PROTOCOL_UNSUPPORTED', category: 'protocol'
        });
      }
      return parsed;
    }

    if (parsed.protocol !== 'evcrate-resource-control' && parsed.protocol !== 'evcrate-advisor-settings') {
      throw new DamHopperClientError(`Unexpected protocol: ${parsed.protocol}`, {
        code: 'PROTOCOL_UNSUPPORTED', category: 'protocol', details: parsed
      });
    }

    if (parsed.protocolVersion !== 1) {
      throw new DamHopperClientError(`Unsupported protocol version: ${parsed.protocolVersion}`, {
        code: 'PROTOCOL_UNSUPPORTED', category: 'protocol'
      });
    }

    return parsed;
  }

  version() { return this.invoke(['version']); }
  health() { return this.invoke(['health']); }
  resourcesList(options = {}) { return this.invoke(buildResourcesListArgs(options)); }
  resourcesGet(resourceId) { return this.invoke(buildResourcesGetArgs(resourceId)); }
  scopesList() { return this.invoke(['scopes', 'list']); }
  scopesGet(resourceId) { return this.invoke(buildScopesGetArgs(resourceId)); }
  scopesAssign(options) { return this.invoke(buildScopesAssignArgs(options)); }
  scopesRemove(options) { return this.invoke(buildScopesMutationArgs('remove', options)); }
  scopesEnable(options) { return this.invoke(buildScopesMutationArgs('enable', options)); }
  scopesDisable(options) { return this.invoke(buildScopesMutationArgs('disable', options)); }
  importsPreview(options) { return this.invoke(buildImportsPreviewArgs(options)); }
  importsApply(options) { return this.invoke(buildImportsApplyArgs(options)); }
  changesPreview(options) { return this.invoke(buildChangesPreviewArgs(options)); }
  changesApply(options) { return this.invoke(buildChangesApplyArgs(options)); }
  publishDryRun(options = {}) { return this.invoke(buildPublishArgs('dry-run', options)); }
  publishApply(options = {}) { return this.invoke(buildPublishArgs('apply', options)); }
  recover(options = {}) { return this.invoke(buildRecoverArgs(options)); }
}
