import { ControlPlaneError } from '../../errors/control-plane-error.js';
import { canonicalBytes } from '../../protocol/canonical-json.js';
import { writeProjectionFile, copyGraphFile, graphFile, textBytes } from '../projection-utils.js';
import type { ProjectionBuildContext } from '../types.js';
import type { ResourceGraphFile } from '../resource-graph.js';

export function outputPath(path: string): string {
  if (path === '.evcrate-vscode' || path.startsWith('.evcrate-vscode/')) {
    return path;
  }
  return `.evcrate-vscode/${path.replace(/^\/+/u, '')}`;
}

export function writeJson(context: ProjectionBuildContext, path: string, value: unknown): void {
  writeProjectionFile(context, outputPath(path), canonicalBytes(value));
}

export function writeText(context: ProjectionBuildContext, path: string, value: string): void {
  writeProjectionFile(context, outputPath(path), textBytes(value));
}

export function filesUnder(context: ProjectionBuildContext, prefix: string): ResourceGraphFile[] {
  const normalized = prefix.replace(/\/$/u, '');
  return context.resources.files.filter((file) => file.path.startsWith(`${normalized}/`));
}

export function sourcePath(prefix: string, file: ResourceGraphFile): string {
  return file.path.slice(prefix.replace(/\/$/u, '').length + 1);
}

export function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new ControlPlaneError('VALIDATION_INVALID');
  }
}

export function copyFile(
  context: ProjectionBuildContext,
  source: string,
  destination: string,
  transform?: (text: string) => string
): void {
  const file = graphFile(context, source);
  const output = outputPath(destination);
  if (!transform || file.bytes.slice(0, 1024).includes(0)) {
    copyGraphFile(context, source, output);
    return;
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(file.bytes).replace(/\r\n?/gu, '\n');
  } catch {
    copyGraphFile(context, source, output);
    return;
  }
  writeProjectionFile(context, output, textBytes(transform(text)), file.executable ?? false);
}
export function copyText(
  context: ProjectionBuildContext,
  source: string,
  destination: string,
  transform: (text: string) => string
): void {
  const file = graphFile(context, source);
  const text = transform(decodeUtf8(file.bytes));
  writeProjectionFile(context, outputPath(destination), textBytes(text), file.executable ?? false);
}
