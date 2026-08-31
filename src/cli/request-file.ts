import { constants, closeSync, fstatSync, openSync, readSync } from 'node:fs';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { JsonValue, MAX_JSON_BYTES, parseJsonDocument } from '../protocol/json.js';
import { resolveSafePath } from '../context/path-resolution.js';

export interface RequestFileOptions {
  readonly cwd?: string;
  readonly maxBytes?: number;
}

function boundedMaxBytes(value: number | undefined): number {
  const maxBytes = value ?? MAX_JSON_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > MAX_JSON_BYTES) {
    throw new ControlPlaneError('PROTOCOL_INVALID');
  }
  return maxBytes;
}

function readFromDescriptor(fileDescriptor: number, maxBytes: number): Uint8Array {
  const bytes = Buffer.allocUnsafe(maxBytes + 1);
  let offset = 0;
  while (offset < bytes.byteLength) {
    const count = readSync(fileDescriptor, bytes, offset, bytes.byteLength - offset, null);
    if (count === 0) break;
    offset += count;
  }
  if (offset > maxBytes) throw new ControlPlaneError('PROTOCOL_INVALID');
  return bytes.subarray(0, offset);
}

export function readBoundedRequestFile(
  filePath: string,
  options: RequestFileOptions = {}
): JsonValue {
  const cwd = options.cwd ?? process.cwd();
  let resolved: string;
  try {
    resolved = resolveSafePath(filePath, cwd);
  } catch (error) {
    if (error instanceof ControlPlaneError) throw error;
    throw new ControlPlaneError('PATH_UNSAFE');
  }

  const maxBytes = boundedMaxBytes(options.maxBytes);
  let fileDescriptor: number | undefined;
  try {
    const flags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);
    fileDescriptor = openSync(resolved, flags);
    const stat = fstatSync(fileDescriptor);
    if (!stat.isFile()) throw new ControlPlaneError('PATH_UNSAFE');
    return parseJsonDocument(readFromDescriptor(fileDescriptor, maxBytes), maxBytes);
  } catch (error) {
    if (error instanceof ControlPlaneError) throw error;
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ELOOP' || code === 'ENOTDIR') {
      throw new ControlPlaneError('PATH_UNSAFE');
    }
    throw new ControlPlaneError('PROTOCOL_INVALID');
  } finally {
    if (fileDescriptor !== undefined) closeSync(fileDescriptor);
  }
}

export function resolveRequestFile(filePath: string, cwd = process.cwd()): string {
  return resolveSafePath(filePath, cwd);
}
