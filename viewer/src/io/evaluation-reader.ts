import type { FileSystemFileHandle } from './file-system-access.d.ts';
import { AdvisorContractError } from '../../../src/protocol/advisor-contract-runtime.js';
import {
  type EvaluationDocumentV1,
  validateEvaluationDocumentAsync,
  MAX_EVALUATION_FILE_BYTES
} from '../../../src/protocol/advisor-evaluation.js';
import { computeBrowserSha256 } from './browser-digest.js';

export type EvaluationReaderStatus =
  | 'EVALUATION_READY'
  | 'EVALUATION_SELECTION_CANCELLED'
  | 'EVALUATION_PERMISSION_DENIED'
  | 'EVALUATION_OVERSIZED'
  | 'EVALUATION_INVALID_JSON'
  | 'EVALUATION_UNSUPPORTED_VERSION'
  | 'EVALUATION_INVALID'
  | 'EVALUATION_DIGEST_MISMATCH'
  | 'EVALUATION_READ_FAILED';

export interface EvaluationReaderResult {
  readonly status: EvaluationReaderStatus;
  readonly document?: EvaluationDocumentV1;
  readonly fileName?: string;
  readonly bytes?: number;
  readonly issueCode?: string;
  readonly issuePath?: string;
}

const decoder = new TextDecoder('utf-8', { fatal: true });

export async function selectAndReadEvaluationFiles(
  digestFn: (data: string) => Promise<string> = computeBrowserSha256
): Promise<readonly EvaluationReaderResult[]> {
  if (typeof globalThis.showOpenFilePicker !== 'function') {
    return [{ status: 'EVALUATION_SELECTION_CANCELLED' }];
  }
  let handles: FileSystemFileHandle[];
  try {
    handles = await globalThis.showOpenFilePicker({
      id: 'evcrate-evaluation',
      multiple: true,
      types: [
        {
          description: 'Advisor Evaluation JSON',
          accept: { 'application/json': ['.json'] }
        }
      ]
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      return [{ status: 'EVALUATION_SELECTION_CANCELLED' }];
    }
    return [{ status: 'EVALUATION_READ_FAILED' }];
  }

  if (!handles || handles.length === 0) {
    return [{ status: 'EVALUATION_SELECTION_CANCELLED' }];
  }

  const results: EvaluationReaderResult[] = [];
  for (const handle of handles) {
    results.push(await readEvaluationFileHandle(handle, digestFn));
  }
  return results;
}

export async function readEvaluationFileHandle(
  handle: FileSystemFileHandle,
  digestFn: (data: string) => Promise<string> = computeBrowserSha256
): Promise<EvaluationReaderResult> {
  const fileName = handle.name;
  try {
    if (typeof handle.queryPermission === 'function') {
      let permission = await handle.queryPermission({ mode: 'read' });
      if (permission !== 'granted' && typeof handle.requestPermission === 'function') {
        permission = await handle.requestPermission({ mode: 'read' });
      }
      if (permission !== 'granted') {
        return { status: 'EVALUATION_PERMISSION_DENIED', fileName };
      }
    }
  } catch {
    return { status: 'EVALUATION_PERMISSION_DENIED', fileName };
  }

  let file: File;
  try {
    file = await handle.getFile();
  } catch {
    return { status: 'EVALUATION_READ_FAILED', fileName };
  }

  if (file.size > MAX_EVALUATION_FILE_BYTES) {
    return { status: 'EVALUATION_OVERSIZED', fileName, bytes: file.size };
  }

  let buf: ArrayBuffer;
  try {
    buf = await file.arrayBuffer();
  } catch {
    return { status: 'EVALUATION_READ_FAILED', fileName };
  }

  if (buf.byteLength > MAX_EVALUATION_FILE_BYTES) {
    return { status: 'EVALUATION_OVERSIZED', fileName, bytes: buf.byteLength };
  }

  let text: string;
  try {
    text = decoder.decode(buf);
  } catch {
    return { status: 'EVALUATION_INVALID_JSON', fileName, bytes: buf.byteLength };
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { status: 'EVALUATION_INVALID_JSON', fileName, bytes: buf.byteLength };
  }

  try {
    const document = await validateEvaluationDocumentAsync(json, { digestFn });
    return { status: 'EVALUATION_READY', document, fileName, bytes: buf.byteLength };
  } catch (err: unknown) {
    if (err instanceof AdvisorContractError) {
      const code = err.issue.code;
      const path = err.issue.path;
      if (code === 'CONTRACT_VERSION_UNSUPPORTED') {
        return { status: 'EVALUATION_UNSUPPORTED_VERSION', fileName, bytes: buf.byteLength, issueCode: code, issuePath: path };
      }
      if (code === 'CONTRACT_DIGEST_MISMATCH') {
        return { status: 'EVALUATION_DIGEST_MISMATCH', fileName, bytes: buf.byteLength, issueCode: code, issuePath: path };
      }
      if (code === 'CONTRACT_SIZE_EXCEEDED') {
        return { status: 'EVALUATION_OVERSIZED', fileName, bytes: buf.byteLength, issueCode: code, issuePath: path };
      }
      return { status: 'EVALUATION_INVALID', fileName, bytes: buf.byteLength, issueCode: code, issuePath: path };
    }
    return { status: 'EVALUATION_READ_FAILED', fileName, bytes: buf.byteLength };
  }
}
