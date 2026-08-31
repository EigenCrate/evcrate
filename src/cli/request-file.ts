import { lstatSync, readFileSync } from 'node:fs';
import { ControlPlaneError } from '../errors/control-plane-error.js';
import { JsonValue, MAX_JSON_BYTES, parseJsonDocument } from '../protocol/json.js';
import { resolveSafePath } from '../context/path-resolution.js';

export interface RequestFileOptions {
  readonly cwd?: string;
  readonly maxBytes?: number;
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
  try {
    const stat = lstatSync(resolved);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new ControlPlaneError('PATH_UNSAFE');
    const maxBytes = options.maxBytes ?? MAX_JSON_BYTES;
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || stat.size > maxBytes) {
      throw new ControlPlaneError('PROTOCOL_INVALID');
    }
    return parseJsonDocument(readFileSync(resolved), maxBytes);
  } catch (error) {
    if (error instanceof ControlPlaneError) throw error;
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new ControlPlaneError('PATH_UNSAFE');
    throw new ControlPlaneError('PROTOCOL_INVALID');
  }
}

export function resolveRequestFile(filePath: string, cwd = process.cwd()): string {
  return resolveSafePath(filePath, cwd);
}
