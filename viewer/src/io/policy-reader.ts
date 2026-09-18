import type { FileSystemFileHandle } from './file-system-access.d.ts';
import { MAX_POLICY_BYTES } from './history-scan-budget.js';
import {
  inspectPolicy,
  AdvisorContractError,
  type AdvisorPolicyV1,
  type AdvisorPolicyV2
} from '../../../src/protocol/advisor-contract-runtime.js';

export type PolicyReaderStatus =
  | 'POLICY_READY'
  | 'POLICY_MIGRATION_REQUIRED'
  | 'POLICY_SELECTION_CANCELLED'
  | 'POLICY_PERMISSION_DENIED'
  | 'POLICY_OVERSIZED'
  | 'POLICY_INVALID_JSON'
  | 'POLICY_UNSUPPORTED_VERSION'
  | 'POLICY_INVALID'
  | 'POLICY_READ_FAILED';

export interface PolicyReaderResult {
  readonly status: PolicyReaderStatus;
  readonly policy?: AdvisorPolicyV2 | AdvisorPolicyV1;
  readonly legacy?: boolean;
  readonly migrationRequired?: boolean;
  readonly fileName?: string;
  readonly bytes?: number;
}

const decoder = new TextDecoder('utf-8', { fatal: true });

export async function selectAndReadPolicyFile(): Promise<PolicyReaderResult> {
  if (typeof globalThis.showOpenFilePicker !== 'function') {
    return { status: 'POLICY_SELECTION_CANCELLED' };
  }
  let handles: FileSystemFileHandle[];
  try {
    handles = await globalThis.showOpenFilePicker({
      multiple: false,
      types: [
        {
          description: 'EVCrate Advisor Policy',
          accept: { 'application/json': ['.json'] }
        }
      ]
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { status: 'POLICY_SELECTION_CANCELLED' };
    }
    return { status: 'POLICY_SELECTION_CANCELLED' };
  }

  const handle = handles[0];
  if (!handle) return { status: 'POLICY_SELECTION_CANCELLED' };
  return readPolicyFileHandle(handle);
}

export async function readPolicyFileHandle(handle: FileSystemFileHandle): Promise<PolicyReaderResult> {
  const fileName = handle.name;
  try {
    const perm = await handle.queryPermission({ mode: 'read' });
    if (perm !== 'granted') {
      const requested = typeof handle.requestPermission === 'function' ? await handle.requestPermission({ mode: 'read' }) : perm;
      if (requested !== 'granted') {
        return { status: 'POLICY_PERMISSION_DENIED', fileName };
      }
    }
  } catch {
    return { status: 'POLICY_PERMISSION_DENIED', fileName };
  }

  let file: File;
  try {
    file = await handle.getFile();
  } catch {
    return { status: 'POLICY_READ_FAILED', fileName };
  }

  if (file.size > MAX_POLICY_BYTES) {
    return { status: 'POLICY_OVERSIZED', fileName, bytes: file.size };
  }

  let buf: ArrayBuffer;
  try {
    buf = await file.arrayBuffer();
  } catch {
    return { status: 'POLICY_READ_FAILED', fileName };
  }

  if (buf.byteLength > MAX_POLICY_BYTES) {
    return { status: 'POLICY_OVERSIZED', fileName, bytes: buf.byteLength };
  }

  let text: string;
  try {
    text = decoder.decode(buf);
  } catch {
    return { status: 'POLICY_INVALID_JSON', fileName, bytes: buf.byteLength };
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { status: 'POLICY_INVALID_JSON', fileName, bytes: buf.byteLength };
  }

  try {
    const inspected = inspectPolicy(json);
    if (inspected.legacy || inspected.migrationRequired) {
      return {
        status: 'POLICY_MIGRATION_REQUIRED',
        policy: inspected.policy,
        legacy: true,
        migrationRequired: true,
        fileName,
        bytes: buf.byteLength
      };
    }
    return {
      status: 'POLICY_READY',
      policy: inspected.policy as AdvisorPolicyV2,
      legacy: false,
      migrationRequired: false,
      fileName,
      bytes: buf.byteLength
    };
  } catch (err: unknown) {
    if (err instanceof AdvisorContractError && err.issue.code === 'CONTRACT_VERSION_UNSUPPORTED') {
      return { status: 'POLICY_UNSUPPORTED_VERSION', fileName, bytes: buf.byteLength };
    }
    return { status: 'POLICY_INVALID', fileName, bytes: buf.byteLength };
  }
}
