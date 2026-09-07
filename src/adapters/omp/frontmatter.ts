import { ControlPlaneError } from '../../errors/control-plane-error.js';
import { normalizeLf } from './resources.js';

export interface Frontmatter { readonly fields: Readonly<Record<string, string>>; readonly body: string; }
function invalid(): never { throw new ControlPlaneError('VALIDATION_INVALID'); }
function unquote(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    try { return JSON.parse(value); } catch { return value.slice(1, -1).replaceAll('\\"', '"'); }
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replaceAll("''", "'");
  }
  return value;
}
export function splitFrontmatter(value: string): Frontmatter {
  const text = normalizeLf(value);
  if (!text.startsWith('---\n')) invalid();
  const end = text.indexOf('\n---\n', 4);
  if (end < 0) invalid();
  const fields: Record<string, string> = {};
  const lines = text.slice(4, end).split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    const match = /^([A-Za-z][A-Za-z0-9_-]*):(?:\s?(.*))?$/u.exec(line);
    if (!match || match[1] in fields) invalid();
    const name = match[1];
    const raw = match[2] ?? '';
    const block = raw === '>' || raw === '>-' || raw === '|' || raw === '|-';
    const nested = !raw && index + 1 < lines.length && /^\s/u.test(lines[index + 1]);
    if (block || nested) {
      const values: string[] = [];
      index += 1;
      while (index < lines.length && (!lines[index] || /^\s/u.test(lines[index]))) values.push(lines[index].trim()), index += 1;
      index -= 1;
      fields[name] = block && raw.startsWith('>') ? values.filter(Boolean).join(' ') : values.join('\n').trim();
    } else fields[name] = unquote(raw.trim());
  }
  return Object.freeze({ fields: Object.freeze(fields), body: text.slice(end + 5) });
}
function scalar(value: string): string { return value.replace(/\s+/gu, ' ').replaceAll('\\', '\\\\').replaceAll('"', '\\"'); }
export function serializeFrontmatter(fields: Readonly<Record<string, string>>, body: string): string {
  const lines = ['---'];
  for (const key of Object.keys(fields).sort()) lines.push(`${key}: "${scalar(fields[key])}"`);
  lines.push('---', '', normalizeLf(body).replace(/\n+$/u, ''), '');
  return lines.join('\n');
}
