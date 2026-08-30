import { ControlPlaneError } from '../errors/control-plane-error.js';
import { isPlainObject } from './json.js';
import { ADVISOR_BACKENDS } from './advisor-settings.js';
import type { AdvisorBackend } from './advisor-settings.js';
import {
  assertExactKeys, boundedText, rejectCounselFields, validateRequestId,
  DIAGNOSTIC_PROTOCOL, PROTOCOL_VERSION
} from './validation.js';
export interface DiagnosticRequest {
  protocol: typeof DIAGNOSTIC_PROTOCOL;
  protocolVersion: 1;
  requestId: string;
  operation: 'qualify';
}
export interface DiagnosticTarget { backend: AdvisorBackend; model: string; effort: string; }
export interface DiagnosticProbes {
  version: { status: 'passed'; value: string };
  auth: { status: 'passed' };
  capabilities: {
    status: 'passed';
    model: string;
    effort: string;
    noninteractive: boolean;
    session: string;
    tools: string;
    output: string;
  };
}
export interface DiagnosticSuccess {
  protocol: typeof DIAGNOSTIC_PROTOCOL;
  protocolVersion: 1;
  requestId: string;
  status: 'QUALIFIED';
  target: DiagnosticTarget;
  probes: DiagnosticProbes;
}
export interface DiagnosticFailure {
  protocol: typeof DIAGNOSTIC_PROTOCOL;
  protocolVersion: 1;
  requestId: string | null;
  status: 'FAILED';
  target: DiagnosticTarget | null;
  probes: {
    version: { status: 'passed' | 'not-run'; value?: string };
    auth: { status: 'passed' | 'not-run' };
    capabilities: { status: 'passed' | 'not-run' };
  };
  error: {
    code: DiagnosticErrorCode;
    category: DiagnosticErrorCategory;
    action: string;
    message: string;
  };
}
const REQUEST_KEYS = Object.freeze(['protocol', 'protocolVersion', 'requestId', 'operation'] as const);
const RESULT_KEYS = Object.freeze(['protocol', 'protocolVersion', 'requestId', 'status', 'target', 'probes'] as const);
const PROBE_KEYS = Object.freeze(['version', 'auth', 'capabilities'] as const);
const DIAGNOSTIC_ERROR_DEFINITIONS = {
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
} as const;
export type DiagnosticErrorCode = keyof typeof DIAGNOSTIC_ERROR_DEFINITIONS;
export type DiagnosticErrorCategory = typeof DIAGNOSTIC_ERROR_DEFINITIONS[DiagnosticErrorCode]['category'];
export function validateDiagnosticRequest(value: unknown): DiagnosticRequest {
  assertExactKeys(value, REQUEST_KEYS, 'DIAGNOSTIC_INVALID');
  const request = value as Record<string, unknown>;
  if (request.protocol !== DIAGNOSTIC_PROTOCOL || request.protocolVersion !== PROTOCOL_VERSION
    || request.operation !== 'qualify') throw new ControlPlaneError('DIAGNOSTIC_INVALID');
  rejectCounselFields(request, [], 'DIAGNOSTIC_INVALID');
  return {
    protocol: DIAGNOSTIC_PROTOCOL,
    protocolVersion: 1,
    requestId: validateRequestId(request.requestId, 'DIAGNOSTIC_INVALID'),
    operation: 'qualify'
  };
}
export function createDiagnosticRequest(requestId: string): DiagnosticRequest {
  return validateDiagnosticRequest({
    protocol: DIAGNOSTIC_PROTOCOL, protocolVersion: 1, requestId, operation: 'qualify'
  });
}
function target(value: unknown): DiagnosticTarget {
  assertExactKeys(value, ['backend', 'model', 'effort'], 'DIAGNOSTIC_INVALID');
  const item = value as Record<string, unknown>;
  const backend = boundedText(item.backend, 64, 'backend', 'DIAGNOSTIC_INVALID');
  if (!ADVISOR_BACKENDS.includes(backend as AdvisorBackend)) {
    throw new ControlPlaneError('DIAGNOSTIC_INVALID');
  }
  return {
    backend: backend as AdvisorBackend,
    model: boundedText(item.model, 256, 'model', 'DIAGNOSTIC_INVALID'),
    effort: boundedText(item.effort, 64, 'effort', 'DIAGNOSTIC_INVALID')
  };
}
function validateSuccess(result: Record<string, unknown>): DiagnosticSuccess {
  assertExactKeys(result, RESULT_KEYS, 'DIAGNOSTIC_INVALID');
  if (result.protocol !== DIAGNOSTIC_PROTOCOL || result.protocolVersion !== 1
    || result.status !== 'QUALIFIED') throw new ControlPlaneError('DIAGNOSTIC_INVALID');
  if (!isPlainObject(result.probes)) throw new ControlPlaneError('DIAGNOSTIC_INVALID');
  const probes = result.probes;
  assertExactKeys(probes, PROBE_KEYS, 'DIAGNOSTIC_INVALID');
  if (!isPlainObject(probes.version) || !isPlainObject(probes.auth)
    || !isPlainObject(probes.capabilities)) throw new ControlPlaneError('DIAGNOSTIC_INVALID');
  assertExactKeys(probes.version, ['status', 'value'], 'DIAGNOSTIC_INVALID');
  assertExactKeys(probes.auth, ['status'], 'DIAGNOSTIC_INVALID');
  assertExactKeys(probes.capabilities, [
    'status', 'model', 'effort', 'noninteractive', 'session', 'tools', 'output'
  ], 'DIAGNOSTIC_INVALID');
  const version = probes.version;
  const auth = probes.auth;
  const capabilities = probes.capabilities;
  if (version.status !== 'passed' || auth.status !== 'passed'
    || capabilities.status !== 'passed' || typeof capabilities.noninteractive !== 'boolean'
    || typeof capabilities.session !== 'string' || typeof capabilities.tools !== 'string') {
    throw new ControlPlaneError('DIAGNOSTIC_INVALID');
  }
  const normalizedTarget = target(result.target);
  const model = boundedText(capabilities.model, 256, 'model', 'DIAGNOSTIC_INVALID');
  const effort = boundedText(capabilities.effort, 64, 'effort', 'DIAGNOSTIC_INVALID');
  if (model !== normalizedTarget.model || effort !== normalizedTarget.effort) {
    throw new ControlPlaneError('DIAGNOSTIC_INVALID');
  }
  return {
    protocol: DIAGNOSTIC_PROTOCOL, protocolVersion: 1,
    requestId: validateRequestId(result.requestId, 'DIAGNOSTIC_INVALID'), status: 'QUALIFIED',
    target: normalizedTarget,
    probes: {
      version: { status: 'passed', value: boundedText(version.value, 256, 'version', 'DIAGNOSTIC_INVALID') },
      auth: { status: 'passed' },
      capabilities: {
        status: 'passed',
        model,
        effort,
        noninteractive: capabilities.noninteractive,
        session: boundedText(capabilities.session, 64, 'session', 'DIAGNOSTIC_INVALID'),
        tools: boundedText(capabilities.tools, 64, 'tools', 'DIAGNOSTIC_INVALID'),
        output: boundedText(capabilities.output, 64, 'output', 'DIAGNOSTIC_INVALID')
      }
    }
  };
}
function validateFailure(result: Record<string, unknown>): DiagnosticFailure {
  assertExactKeys(result, [...RESULT_KEYS, 'error'], 'DIAGNOSTIC_INVALID');
  if (result.protocol !== DIAGNOSTIC_PROTOCOL || result.protocolVersion !== 1
    || result.status !== 'FAILED') throw new ControlPlaneError('DIAGNOSTIC_INVALID');
  if (!isPlainObject(result.probes) || !isPlainObject(result.error)) {
    throw new ControlPlaneError('DIAGNOSTIC_INVALID');
  }
  const probes = result.probes;
  assertExactKeys(probes, PROBE_KEYS, 'DIAGNOSTIC_INVALID');
  const normalizedProbes: DiagnosticFailure['probes'] = {
    version: validateFailureProbe(probes.version, true),
    auth: validateFailureProbe(probes.auth),
    capabilities: validateFailureProbe(probes.capabilities)
  };
  if ((normalizedProbes.auth.status === 'passed' && normalizedProbes.version.status !== 'passed')
    || (normalizedProbes.capabilities.status === 'passed'
      && (normalizedProbes.version.status !== 'passed' || normalizedProbes.auth.status !== 'passed'))
    || (normalizedProbes.version.status === 'passed'
      && normalizedProbes.auth.status === 'passed' && normalizedProbes.capabilities.status === 'passed')) {
    throw new ControlPlaneError('DIAGNOSTIC_INVALID');
  }
  const error = result.error;
  assertExactKeys(error, ['code', 'category', 'action', 'message'], 'DIAGNOSTIC_INVALID');
  const code = boundedText(error.code, 64, 'error code', 'DIAGNOSTIC_INVALID');
  const category = boundedText(error.category, 64, 'error category', 'DIAGNOSTIC_INVALID');
  const action = boundedText(error.action, 256, 'error action', 'DIAGNOSTIC_INVALID');
  const message = boundedText(error.message, 256, 'error message', 'DIAGNOSTIC_INVALID');
  if (!Object.hasOwn(DIAGNOSTIC_ERROR_DEFINITIONS, code)) {
    throw new ControlPlaneError('DIAGNOSTIC_INVALID');
  }
  const typedCode = code as DiagnosticErrorCode;
  const definition = DIAGNOSTIC_ERROR_DEFINITIONS[typedCode];
  if (category !== definition.category || action !== definition.action || message !== definition.message) {
    throw new ControlPlaneError('DIAGNOSTIC_INVALID');
  }
  return {
    protocol: DIAGNOSTIC_PROTOCOL, protocolVersion: 1,
    requestId: nullableRequestId(result.requestId), status: 'FAILED',
    target: result.target === null ? null : target(result.target),
    probes: normalizedProbes,
    error: {
      code: typedCode,
      category: category as DiagnosticErrorCategory,
      action,
      message
    }
  };
}

function validateFailureProbe(value: unknown, version = false): { status: 'passed' | 'not-run'; value?: string } {
  if (!isPlainObject(value)) throw new ControlPlaneError('DIAGNOSTIC_INVALID');
  if (value.status !== 'passed' && value.status !== 'not-run') {
    throw new ControlPlaneError('DIAGNOSTIC_INVALID');
  }
  if (version && value.status === 'passed') {
    assertExactKeys(value, ['status', 'value'], 'DIAGNOSTIC_INVALID');
    return {
      status: 'passed', value: boundedText(value.value, 256, 'version', 'DIAGNOSTIC_INVALID')
    };
  }
  assertExactKeys(value, ['status'], 'DIAGNOSTIC_INVALID');
  return { status: value.status };
}

function nullableRequestId(value: unknown): string | null {
  return value === null ? null : validateRequestId(value, 'DIAGNOSTIC_INVALID');
}
export function validateDiagnosticResult(value: unknown): DiagnosticSuccess | DiagnosticFailure {
  if (!isPlainObject(value)) throw new ControlPlaneError('DIAGNOSTIC_INVALID');
  const result = value as Record<string, unknown>;
  rejectCounselFields(result, ['backend'], 'DIAGNOSTIC_INVALID');
  if (result.status === 'QUALIFIED') return validateSuccess(result);
  if (result.status === 'FAILED') return validateFailure(result);
  throw new ControlPlaneError('DIAGNOSTIC_INVALID');
}
export function createDiagnosticSuccess(
  requestId: string, targetValue: DiagnosticTarget, probes: DiagnosticProbes
): DiagnosticSuccess {
  return validateDiagnosticResult({
    protocol: DIAGNOSTIC_PROTOCOL, protocolVersion: 1, requestId, status: 'QUALIFIED',
    target: targetValue, probes
  }) as DiagnosticSuccess;
}
export function createDiagnosticFailure(
  requestId: string | null,
  targetValue: DiagnosticTarget | null,
  probes: DiagnosticFailure['probes'],
  error: DiagnosticFailure['error']
): DiagnosticFailure {
  return validateDiagnosticResult({
    protocol: DIAGNOSTIC_PROTOCOL, protocolVersion: 1, requestId, status: 'FAILED',
    target: targetValue, probes, error
  }) as DiagnosticFailure;
}
