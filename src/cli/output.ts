import { canonicalJson } from '../protocol/json.js';
import { serializeControlPlaneError, CONTROL_PLANE_ERROR_DETAILS } from '../errors/control-plane-error.js';
import type { SerializedControlPlaneError } from '../errors/control-plane-error.js';
import { CONTROL_PLANE_EXIT_CODES } from '../errors/control-plane-error.js';
import type { AdvisorSettingsResult } from '../protocol/advisor-settings.js';
import type { DiagnosticFailure, DiagnosticSuccess } from '../protocol/diagnostic.js';
import type { ResourceResult } from '../protocol/resource-control.js';
import type { CliOutput } from './types.js';

export interface CliErrorResult {
  readonly protocol: 'evcrate-cli';
  readonly protocolVersion: 1;
  readonly requestId: string;
  readonly command: string;
  readonly status: 'error';
  readonly error: SerializedControlPlaneError;
}

export type CliResult = ResourceResult | AdvisorSettingsResult | DiagnosticSuccess | DiagnosticFailure | CliErrorResult;

export interface RenderOptions {
  readonly json?: boolean;
  readonly isTTY?: boolean;
  readonly debug?: boolean;
}

export function createCliErrorResult(
  requestId: string,
  command: string,
  error: unknown
): CliErrorResult {
  return Object.freeze({
    protocol: 'evcrate-cli', protocolVersion: 1, requestId, command, status: 'error',
    error: serializeControlPlaneError(error)
  });
}

function formatLegacyLeftoversWarning(leftovers: unknown): string {
  if (!Array.isArray(leftovers) || leftovers.length === 0) return '';
  const lines = [
    '',
    'Warning: Preserved untracked legacy artifacts detected:',
    ...leftovers.map((l: Record<string, unknown>) => `  - [${String(l.target)}] ${String(l.path)} (${String(l.kind)})`),
    'Manual review recommended: these unmanaged files were preserved and not deleted. Review and back up any customizations before manual removal.'
  ];
  return lines.join('\n');
}

function statusText(result: Record<string, unknown>, debug = false): string {
  if (result.status === 'QUALIFIED') {
    const target = result.target as Record<string, unknown> | null;
    return target ? `qualified ${String(target.backend)} ${String(target.model)}` : 'qualified';
  }
  if (result.status === 'FAILED' || result.status === 'error') {
    const error = result.error as Record<string, unknown> | undefined;
    const isDebug = debug || process.argv.includes('--debug')
      || process.env.EVCRATE_DEBUG === '1' || process.env.EVCRATE_DEBUG === 'true';
    const detail = (isDebug && error && CONTROL_PLANE_ERROR_DETAILS.get(error))
      ? `\n[DEBUG] Detail: ${CONTROL_PLANE_ERROR_DETAILS.get(error)}`
      : '';
    return error ? `error ${String(error.code)}: ${String(error.message)}${detail}` : 'error';
  }
  if (result.status === 'partial') {
    const error = result.error as Record<string, unknown> | undefined;
    return error ? `partial ${String(error.code)}: ${String(error.message)}` : 'partial';
  }
  if (result.status === 'OK' && result.operation === 'get') return 'advisor settings read';
  if (result.status === 'PREVIEW') return 'advisor settings preview ready';
  if (result.status === 'APPLIED') return 'advisor settings applied';
  if (result.status === 'CONFLICT') return 'advisor settings conflict';
  if (result.status === 'RECOVERED' || result.status === 'recovered') return 'recovered';
  if (result.status === 'published' || result.status === 'activated') {
    const payload = result.payload as Record<string, unknown> | undefined;
    const warning = formatLegacyLeftoversWarning(payload?.legacyLeftovers);
    return `published${warning}`;
  }
  if (result.status === 'preview') {
    const payload = result.payload as Record<string, unknown> | undefined;
    const warning = formatLegacyLeftoversWarning(payload?.legacyLeftovers);
    return `preview${warning}`;
  }
  if (result.status === 'ok') {
    const payload = result.payload as Record<string, unknown> | undefined;
    return payload?.version ? `evcrate ${String(payload.version)}` : 'ok';
  }
  return String(result.status ?? 'ok');
}

export function renderResult(result: CliResult, options: RenderOptions = {}): string {
  const machine = options.json === true || options.isTTY !== true;
  if (machine) return `${canonicalJson(result)}\n`;
  return `${statusText(result as unknown as Record<string, unknown>, options.debug)}\n`;
}

export function writeResult(
  result: CliResult,
  output: CliOutput = { isTTY: Boolean(process.stdout.isTTY), write: (value) => process.stdout.write(value) },
  options: RenderOptions = {}
): string {
  const rendered = renderResult(result, { ...options, isTTY: options.isTTY ?? output.isTTY });
  output.write(rendered);
  return rendered;
}

export function exitCodeForResult(result: CliResult): number {
  if (result.protocol === 'evcrate-cli') return CONTROL_PLANE_EXIT_CODES[result.error.category];
  if (result.status === 'QUALIFIED' || result.status === 'OK' || result.status === 'PREVIEW'
    || result.status === 'APPLIED' || result.status === 'RECOVERED' || result.status === 'ok'
    || result.status === 'preview' || result.status === 'applied' || result.status === 'published'
    || result.status === 'activated' || result.status === 'recovered') return 0;
  if (result.status === 'CONFLICT' || result.status === 'conflict') return 4;
  if (result.status === 'partial') return 5;
  if (result.status === 'FAILED') {
    const category = result.error.category;
    return ['timeout', 'cancel', 'process', 'output'].includes(category) ? 6 : 3;
  }
  if (result.status === 'error') return CONTROL_PLANE_EXIT_CODES[result.error.category];
  return 6;
}
