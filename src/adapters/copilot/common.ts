import { canonicalBytes } from '../../protocol/canonical-json.js';
import { ControlPlaneError } from '../../errors/control-plane-error.js';
import { copyGraphFile, graphFile, siblingBytes, writeProjectionFile, textBytes } from '../projection-utils.js';
import type { ProjectionBuildContext } from '../types.js';
import type { ResourceGraphFile } from '../resource-graph.js';

export interface Frontmatter {
  readonly fields: Record<string, string>;
  readonly body: string;
}

export function invalid(): never { throw new ControlPlaneError('VALIDATION_INVALID'); }
export function unsafe(): never { throw new ControlPlaneError('PATH_UNSAFE'); }

export function filesUnder(context: ProjectionBuildContext, prefix: string): ResourceGraphFile[] {
  const normalized = prefix.replace(/\/$/u, '');
  return context.resources.files.filter((file) => file.path === normalized || file.path.startsWith(`${normalized}/`));
}

export function optionalGraphFile(context: ProjectionBuildContext, path: string): ResourceGraphFile | undefined {
  return context.resources.files.find((file) => file.path === path);
}

export function readSibling(context: ProjectionBuildContext, path: string): Uint8Array {
  return siblingBytes(context, path);
}

export function decode(bytes: Uint8Array): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/\r\n?/gu, '\n'); }
  catch { return invalid(); }
}

export function parseFrontmatter(value: string): Frontmatter {
  const text = value.replace(/^\ufeff/u, '').replace(/\r\n?/gu, '\n');
  if (!text.startsWith('---\n')) return { fields: {}, body: text };
  const match = /^---\n([\s\S]*?)\n---(?:\n|$)/u.exec(text);
  if (!match) return invalid();
  const fields: Record<string, string> = {};
  const lines = match[1].split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    if (/^\s/u.test(line)) return invalid();
    const colon = line.indexOf(':');
    if (colon <= 0) return invalid();
    const key = line.slice(0, colon).trim();
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/u.test(key) || key in fields) return invalid();
    const raw = line.slice(colon + 1).trim();
    const block = raw === '|' || raw === '|-' || raw === '>' || raw === '>-';
    const list = raw === '' && index + 1 < lines.length && /^\s*-\s*/u.test(lines[index + 1]);
    if (block || list || (!raw && index + 1 < lines.length && /^\s/u.test(lines[index + 1]))) {
      const continuation: string[] = [];
      index += 1;
      while (index < lines.length && (!lines[index].trim() || /^\s/u.test(lines[index]))) {
        continuation.push(list ? lines[index].replace(/^\s*-\s?/u, '').trim() : lines[index].trim());
        index += 1;
      }
      index -= 1;
      fields[key] = raw.startsWith('>') ? continuation.join(' ').trim() : continuation.join('\n').trim();
    } else {
      fields[key] = raw;
    }
  }
  return { fields, body: text.slice(match[0].length) };
}

export function fieldString(fields: Record<string, string>, key: string): string {
  const value = fields[key] ?? '';
  if (value.startsWith('"') && value.endsWith('"')) {
    try { const parsed: unknown = JSON.parse(value); return typeof parsed === 'string' ? parsed : value; }
    catch { return value; }
  }
  return value;
}

function outputPath(path: string): string {
  return path === '.copilot' || path.startsWith('.copilot/') ? path : `.copilot/${path}`;
}
export function writeJson(context: ProjectionBuildContext, path: string, value: unknown): void {
  writeProjectionFile(context, outputPath(path), canonicalBytes(value));
}

export function copyFile(context: ProjectionBuildContext, source: string, destination: string, transform?: (text: string) => string): void {
  const file = graphFile(context, source);
  const output = outputPath(destination);
  if (!transform || file.bytes.slice(0, 1024).includes(0)) {
    copyGraphFile(context, source, output);
    return;
  }
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(file.bytes).replace(/\r\n?/gu, '\n'); }
  catch { copyGraphFile(context, source, output); return; }
  writeProjectionFile(context, output, textBytes(transform(text)), file.mode);
}

export function copyText(context: ProjectionBuildContext, source: string, destination: string, transform: (text: string) => string): void {
  const file = graphFile(context, source);
  writeProjectionFile(context, outputPath(destination), textBytes(transform(decode(file.bytes))), file.mode);
}

export function sourcePath(prefix: string, file: ResourceGraphFile): string {
  return file.path.slice(prefix.replace(/\/$/u, '').length + 1);
}

export function targetName(value: string): string {
  const result = value.replace(/(?:__|[_\s]+)/gu, '-').replace(/[^A-Za-z0-9-]+/gu, '-').replace(/-+/gu, '-').replace(/^-|-$/gu, '').toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(result)) return invalid();
  return result;
}

export function parseJson(context: ProjectionBuildContext, path: string): Record<string, unknown> {
  const file = optionalGraphFile(context, path);
  if (!file) return invalid();
  try {
    const value: unknown = JSON.parse(decode(file.bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
    return value as Record<string, unknown>;
  } catch { return invalid(); }
}
