import { readdirSync } from 'node:fs';
import { relative } from 'node:path';
import { ControlPlaneError } from '../../errors/control-plane-error.js';
import { canonicalBytes } from '../../protocol/canonical-json.js';
import { parseJsonDocument } from '../../protocol/json.js';
import { isProductionControllerArtifact, ensureProjectionDirectory, writeProjectionFile } from '../projection-utils.js';
import type { ProjectionBuildContext } from '../types.js';

export function fail(): never { throw new ControlPlaneError('VALIDATION_INVALID'); }
export function normalizeLf(value: string): string { return value.replace(/\r\n?/gu, '\n'); }

export function file(context: ProjectionBuildContext, path: string) {
  const found = context.resources.files.find((entry) => entry.path === path);
  if (!found) fail();
  return found;
}
export function bytes(context: ProjectionBuildContext, path: string): Uint8Array { return Uint8Array.from(file(context, path).bytes); }
export function text(context: ProjectionBuildContext, path: string): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes(context, path)); }
  catch { fail(); }
}
export function json(context: ProjectionBuildContext, path: string): Record<string, unknown> {
  const value = parseJsonDocument(bytes(context, path));
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail();
  return value as Record<string, unknown>;
}

function outputPath(path: string): string {
  return path === '.omp' || path.startsWith('.omp/') ? path : `.omp/${path}`;
}
export function prepareOutput(context: ProjectionBuildContext): void {
  const root = ensureProjectionDirectory(context, '.omp');
  try {
    if (readdirSync(root).length) fail();
  } catch (error) { if (error instanceof ControlPlaneError) throw error; fail(); }
}
export function write(context: ProjectionBuildContext, path: string, value: Uint8Array, executable = false): void {
  writeProjectionFile(context, outputPath(path), value, executable);
}
export function writeText(context: ProjectionBuildContext, path: string, value: string, executable = false): void {
  write(context, path, new TextEncoder().encode(normalizeLf(value)), executable);
}
export function writeJson(context: ProjectionBuildContext, path: string, value: unknown): void {
  const encoded = canonicalBytes(value);
  const withNewline = new Uint8Array(encoded.length + 1);
  withNewline.set(encoded);
  withNewline[encoded.length] = 10;
  write(context, path, withNewline);
}
export function copy(context: ProjectionBuildContext, source: string, target: string, transform?: (value: string) => string): void {
  const sourceFile = file(context, source);
  const raw = Uint8Array.from(sourceFile.bytes);
  if (!transform || raw.includes(0)) { write(context, target, raw, sourceFile.executable ?? false); return; }
  let value: string;
  try { value = new TextDecoder('utf-8', { fatal: true }).decode(raw); }
  catch { write(context, target, raw, sourceFile.executable ?? false); return; }
  writeText(context, target, transform(normalizeLf(value)), sourceFile.executable ?? false);
}
export function relativeTo(path: string, prefix: string): string {
  return path === prefix ? '' : path.slice(prefix.length + 1);
}
export function filesUnder(context: ProjectionBuildContext, prefix: string): typeof context.resources.files {
  return context.resources.files.filter((entry) => entry.path === prefix || entry.path.startsWith(`${prefix}/`));
}
export function productionFiles(context: ProjectionBuildContext, prefix: string) {
  return filesUnder(context, prefix).filter((entry) => {
    const rel = relativeTo(entry.path, prefix);
    return !isProductionControllerArtifact(rel);
  });
}
export function copyTree(context: ProjectionBuildContext, sourcePrefix: string, targetPrefix: string, transform?: (value: string) => string): string[] {
  const copied: string[] = [];
  for (const entry of productionFiles(context, sourcePrefix)) {
    const rel = relativeTo(entry.path, sourcePrefix);
    if (!rel) continue;
    copy(context, entry.path, `${targetPrefix}/${rel}`, transform);
    copied.push(rel);
  }
  return copied;
}
export function assertFile(context: ProjectionBuildContext, path: string): void { file(context, path); }
export function outputRelative(context: ProjectionBuildContext, absolute: string): string { return relative(context.stage.path, absolute).split('\\').join('/'); }
