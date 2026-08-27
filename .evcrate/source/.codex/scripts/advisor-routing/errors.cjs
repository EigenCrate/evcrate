'use strict';

const CATALOG = {
  REQUEST_INVALID: {
    category: 'request',
    action: 'Provide one active host and a supported resolve operation.',
    message: 'Advisor routing request is invalid'
  },
  HOME_UNAVAILABLE: {
    category: 'home',
    action: 'Use a platform account with a safe absolute home directory.',
    message: 'Platform home directory is unavailable'
  },
  ROUTE_PATH_UNSAFE: {
    category: 'path',
    action: 'Repair the global EVCrate directory or policy file and retry.',
    message: 'Global advisor policy path is unsafe'
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
  ROUTE_SCHEMA_INVALID: {
    category: 'config',
    action: 'Use the version 1 global advisor policy schema.',
    message: 'Global advisor policy schema is invalid'
  },
  HOST_INVALID: {
    category: 'route',
    action: 'Select one supported active host.',
    message: 'Advisor host is unsupported'
  },
  ROUTE_ENTRY_INVALID: {
    category: 'route',
    action: 'Provide backend, model, effort, and execution exactly once.',
    message: 'Advisor route entry is invalid'
  },
  ROUTE_EXECUTION_INVALID: {
    category: 'route-mode',
    action: 'Use native only for same-host routes and external only for cross-host routes.',
    message: 'Advisor route execution mode does not match its backend'
  },
  NATIVE_CAPABILITY_UNSUPPORTED: {
    category: 'native-capability',
    action: 'Choose an exact selector represented by the active host metadata.',
    message: 'Active host cannot express the native advisor route'
  },
  MODEL_UNSUPPORTED: {
    category: 'model',
    action: 'Choose an exact model supported by the active host.',
    message: 'Advisor model is unsupported by the active host'
  },
  EFFORT_UNSUPPORTED: {
    category: 'effort',
    action: 'Choose an exact effort supported by the active host.',
    message: 'Advisor effort is unsupported by the active host'
  },
  ADAPTER_UNSUPPORTED: {
    category: 'adapter',
    action: 'Use one of the five built-in advisor backends.',
    message: 'Advisor adapter is unsupported'
  },
  EXECUTABLE_UNAVAILABLE: {
    category: 'executable',
    action: 'Install the selected CLI and make it discoverable.',
    message: 'Advisor CLI executable is unavailable'
  },
  CLI_VERSION_UNSUPPORTED: {
    category: 'version',
    action: 'Install a CLI version with the reviewed advisor contract.',
    message: 'Advisor CLI version is unsupported'
  },
  AUTH_UNAVAILABLE: {
    category: 'auth',
    action: 'Authenticate the installed CLI using its own supported flow.',
    message: 'Advisor CLI authentication is unavailable'
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
    action: 'Retry with a complete machine-readable advisor result.',
    message: 'Advisor CLI protocol result is invalid'
  },
  TIMEOUT: {
    category: 'timeout',
    action: 'Retry after reducing the bounded advisor brief or increasing policy limits.',
    message: 'Advisor CLI timed out'
  },
  CANCELLED: {
    category: 'cancel',
    action: 'Retry the advisor checkpoint if it is still required.',
    message: 'Advisor CLI invocation was cancelled'
  },
  PROCESS_FAILED: {
    category: 'process',
    action: 'Inspect the installed CLI status and retry the checkpoint.',
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
    action: 'Use an existing real directory contained by the advisor workspace.',
    message: 'Advisor CLI working directory is invalid'
  },
  CWD_UNSAFE: {
    category: 'cwd',
    action: 'Use a real working directory contained by the advisor workspace.',
    message: 'Advisor CLI working directory is unsafe'
  },
  PROMPT_OVERSIZED: {
    category: 'input',
    action: 'Keep the bounded advisor brief within the configured input limit.',
    message: 'Advisor brief is oversized'
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
    action: 'Return valid UTF-8 advisor output and retry the checkpoint.',
    message: 'Advisor CLI output is not valid UTF-8'
  },
  REQUEST_DEPTH_INVALID: {
    category: 'recursion',
    action: 'Start the advisor checkpoint from the parent workflow only.',
    message: 'Advisor request depth is invalid'
  },
  NATIVE_DISPATCH_UNSUPPORTED: {
    category: 'dispatch',
    action: 'Use the host-native advisor delegation path for a same-host route.',
    message: 'Native advisor dispatch is owned by the active host'
  },
  NATIVE_HANDOFF_INVALID: {
    category: 'native-handoff',
    action: 'Start one fresh native advisor handoff and resume it with its unexpired token.',
    message: 'Native advisor handoff is invalid, expired, or already consumed'
  }
};

for (const definition of Object.values(CATALOG)) Object.freeze(definition);
Object.freeze(CATALOG);

const ERROR_CODES = Object.freeze(Object.fromEntries(Object.keys(CATALOG).map((code) => [code, code])));

class AdvisorRoutingError extends Error {
  constructor(code) {
    const definition = CATALOG[code] || CATALOG.PROCESS_FAILED;
    super(definition.message);
    this.name = 'AdvisorRoutingError';
    this.code = CATALOG[code] ? code : 'PROCESS_FAILED';
    this.category = definition.category;
    this.action = definition.action;
    Object.freeze(this);
  }
}

function createRoutingError(code) {
  return new AdvisorRoutingError(code);
}

function isRoutingError(value) {
  return value instanceof AdvisorRoutingError;
}

function serializeRoutingError(value) {
  const error = isRoutingError(value) ? value : createRoutingError('PROCESS_FAILED');
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
