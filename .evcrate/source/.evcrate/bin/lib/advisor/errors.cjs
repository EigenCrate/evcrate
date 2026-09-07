'use strict';

const CATALOG = Object.freeze({
  REQUEST_INVALID: {
    category: 'request',
    action: 'Provide one exact evcrate-advisor-checkpoint/v1 request.',
    message: 'Advisor checkpoint request is invalid'
  },
  HOME_UNAVAILABLE: {
    category: 'home',
    action: 'Use a platform account with a safe absolute home directory.',
    message: 'Platform home directory is unavailable'
  },
  ROUTE_PATH_UNSAFE: {
    category: 'path',
    action: 'Repair the global EVCrate directory or policy file before the next controller attempt.',
    message: 'Global advisor policy path is unsafe'
  },
  ROUTE_POLICY_REQUIRED: {
    category: 'config',
    action: 'Create ~/.evcrate/advisor-routing.json with one version 1 advisor target.',
    message: 'Global advisor policy is required'
  },
  ROUTE_POLICY_MALFORMED: {
    category: 'config',
    action: 'Replace the global policy with valid JSON.',
    message: 'Global advisor policy is malformed'
  },
  ROUTE_POLICY_OVERSIZED: {
    category: 'config',
    action: 'Keep the global policy within its bounded size.',
    message: 'Global advisor policy is oversized'
  },
  ROUTE_DUPLICATE_KEY: {
    category: 'config',
    action: 'Remove duplicate JSON object keys from the global policy.',
    message: 'Global advisor policy contains duplicate keys'
  },
  ROUTE_CREDENTIAL_FIELD: {
    category: 'config',
    action: 'Remove credential-shaped fields; installed CLIs own authentication.',
    message: 'Global advisor policy contains a credential field'
  },
  ROUTE_SCHEMA_MIGRATION_REQUIRED: {
    category: 'config',
    action: 'Replace version 1 hosts with one version 1 advisor object containing backend, model, effort, and timeout_ms.',
    message: 'Global advisor policy requires migration from host routes'
  },
  ROUTE_SCHEMA_HOSTS_V1: {
    category: 'config',
    action: 'Migrate legacy hosts policy to version 2 advisor policy containing primary and backup routes.',
    message: 'Global advisor policy requires migration from host routes'
  },
  ROUTE_SCHEMA_V1_MIGRATION_REQUIRED: {
    category: 'config',
    action: 'Run settings get, prepare a version 2 policy with primary and backup routes, and preview/apply.',
    message: 'Global advisor policy version 1 requires migration to version 2'
  },
  ROUTE_SCHEMA_INVALID: {
    category: 'config',
    action: 'Use the version 1 global advisor policy schema.',
    message: 'Global advisor policy schema is invalid'
  },
  ROUTE_ENTRY_INVALID: {
    category: 'route',
    action: 'Provide one supported backend, model, effort, and timeout_ms exactly once.',
    message: 'Global advisor target is invalid'
  },
  ROUTE_BACKUP_IDENTICAL: {
    category: 'route',
    action: 'Provide distinct primary and backup routes; identical routes do not provide backup redundancy.',
    message: 'Global advisor backup route is identical to primary route'
  },
  ROUTE_UNAVAILABLE: {
    category: 'route',
    action: 'Ensure at least one configured route is installed and authenticated.',
    message: 'Configured advisor routes are unavailable'
  },
  CLEANUP_UNCONFIRMED: {
    category: 'process',
    action: 'Ensure child processes and workspaces are safely terminated before retrying.',
    message: 'Advisor process or workspace cleanup was unconfirmed'
  },
  AUDIT_DEGRADED: {
    category: 'audit',
    action: 'Free space in ~/.evcrate/advisor-history or prune old history.',
    message: 'Advisor audit history storage is degraded'
  },
  TRANSIENT_PROVIDER_ERROR: {
    category: 'network',
    action: 'Retry the consultation after the cooldown or retry delay has elapsed.',
    message: 'Transient provider or network error encountered'
  },
  STALE_STATE_REVISION: {
    category: 'state',
    action: 'Re-read the task state before applying state mutations.',
    message: 'Task state revision mismatch'
  },
  STALE_EVIDENCE_REVISION: {
    category: 'state',
    action: 'Provide a new consultation for updated evidence.',
    message: 'Evidence revision mismatch against workspace state'
  },
  ADAPTER_UNSUPPORTED: {
    category: 'adapter',
    action: 'Use one of the five candidate advisor backends.',
    message: 'Advisor adapter is unsupported'
  },
  CLI_CAPABILITY_UNSUPPORTED: {
    category: 'capability',
    action: 'Select a qualified backend or complete its Linux capability qualification.',
    message: 'Advisor CLI lacks a qualified controller contract'
  },
  EXECUTABLE_UNAVAILABLE: {
    category: 'executable',
    action: 'Install the selected CLI and make it discoverable.',
    message: 'Advisor CLI executable is unavailable'
  },
  CLI_VERSION_UNSUPPORTED: {
    category: 'version',
    action: 'Install a CLI with valid version output and the reviewed advisor feature contract.',
    message: 'Advisor CLI version is unsupported'
  },
  AUTH_UNAVAILABLE: {
    category: 'auth',
    action: 'Authenticate the installed CLI using its own supported flow.',
    message: 'Advisor CLI authentication is unavailable'
  },
  MODEL_UNSUPPORTED: {
    category: 'model',
    action: 'Select an exact model supported by the selected CLI.',
    message: 'Advisor model is unsupported by the selected CLI'
  },
  EFFORT_UNSUPPORTED: {
    category: 'effort',
    action: 'Select an exact effort supported by the selected CLI.',
    message: 'Advisor effort is unsupported by the selected CLI'
  },
  READ_ONLY_UNSUPPORTED: {
    category: 'read-only',
    action: 'Use a CLI version that supports the reviewed read-only contract.',
    message: 'Advisor CLI cannot enforce read-only execution'
  },
  SESSION_UNSUPPORTED: {
    category: 'session',
    action: 'Use a CLI version that supports an invocation-scoped session.',
    message: 'Advisor CLI cannot enforce session isolation'
  },
  OUTPUT_UNSUPPORTED: {
    category: 'output',
    action: 'Use a CLI version with the reviewed bounded output contract.',
    message: 'Advisor CLI output contract is unsupported'
  },
  PROTOCOL_INVALID: {
    category: 'protocol',
    action: 'Return one complete machine-readable advisor result on the next controller attempt.',
    message: 'Advisor CLI protocol result is invalid'
  },
  TIMEOUT: {
    category: 'timeout',
    action: 'Reduce bounded evidence or adjust the policy deadline before the next controller attempt.',
    message: 'Advisor CLI timed out'
  },
  CANCELLED: {
    category: 'cancel',
    action: 'Resume the checkpoint only after the owner confirms it is still required.',
    message: 'Advisor CLI invocation was cancelled'
  },
  PROCESS_FAILED: {
    category: 'process',
    action: 'Inspect the installed CLI status before the next controller attempt.',
    message: 'Advisor CLI process failed'
  },
  ADVISOR_RECURSION: {
    category: 'recursion',
    action: 'Remove the nested advisor invocation and continue at the parent checkpoint.',
    message: 'Nested advisor dispatch is not allowed'
  },
  ADAPTER_CONTRACT_INVALID: {
    category: 'adapter-contract',
    action: 'Use one built-in adapter implementing the reviewed advisor contract.',
    message: 'Advisor adapter contract is invalid'
  },
  ADAPTER_REGISTRY_INVALID: {
    category: 'adapter-registry',
    action: 'Use the fixed built-in advisor adapter registry.',
    message: 'Advisor adapter registry is invalid'
  },
  INVOCATION_INVALID: {
    category: 'invocation',
    action: 'Use the fixed argv-only invocation produced by a built-in adapter.',
    message: 'Advisor CLI invocation is invalid'
  },
  CWD_INVALID: {
    category: 'cwd',
    action: 'Use the controller-created empty workspace directory.',
    message: 'Advisor CLI working directory is invalid'
  },
  CWD_UNSAFE: {
    category: 'cwd',
    action: 'Use a real controller-created workspace without symlinked ancestors.',
    message: 'Advisor CLI working directory is unsafe'
  },
  PROMPT_OVERSIZED: {
    category: 'input',
    action: 'Keep the serialized checkpoint within the configured input limit.',
    message: 'Advisor checkpoint is oversized'
  },
  OUTPUT_LIMIT: {
    category: 'output',
    action: 'Keep advisor output within the configured byte limit.',
    message: 'Advisor CLI output exceeded its limit'
  },
  LINE_LIMIT: {
    category: 'output',
    action: 'Keep advisor output within the configured line limit.',
    message: 'Advisor CLI output exceeded its line limit'
  },
  OUTPUT_INVALID: {
    category: 'output',
    action: 'Return valid UTF-8 advisor output before the next controller attempt.',
    message: 'Advisor CLI output is not valid UTF-8'
  }
});

const ERROR_CODES = Object.freeze(Object.fromEntries(
  Object.keys(CATALOG).map((code) => [code, code])
));

class AdvisorRoutingError extends Error {
  constructor(code, details = {}) {
    const definition = CATALOG[code] || CATALOG.PROCESS_FAILED;
    super(definition.message);
    this.name = 'AdvisorRoutingError';
    this.code = CATALOG[code] ? code : 'PROCESS_FAILED';
    this.category = definition.category;
    this.action = definition.action;
    if (details && typeof details === 'object' && details.cooldown_ms !== undefined) {
      this.cooldown_ms = details.cooldown_ms;
    }
    Object.freeze(this);
  }
}

function createRoutingError(code, details) {
  return new AdvisorRoutingError(code, details);
}

function isRoutingError(value) {
  return value instanceof AdvisorRoutingError;
}

function serializeRoutingError(value) {
  const code = isRoutingError(value) ? value.code : (value?.code && ERROR_CODES[value.code] ? value.code : 'PROCESS_FAILED');
  const error = isRoutingError(value) ? value : createRoutingError(code);
  return Object.freeze({
    code: error.code,
    category: error.category,
    action: error.action,
    message: error.message
  });
}

module.exports = {
  AdvisorRoutingError,
  ERROR_CODES,
  ERROR_CATALOG: CATALOG,
  createRoutingError,
  isRoutingError,
  serializeRoutingError
};
