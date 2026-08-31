import { ControlPlaneError } from '../../errors/control-plane-error.js';

export interface Frontmatter {
  readonly fields: Readonly<Record<string, string>>;
  readonly body: string;
}

const FIELD = /^([A-Za-z][A-Za-z0-9_-]*):(?:\s?(.*))?$/u;
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export function normalizeLf(value: string): string {
  return value.replace(/\r\n/gu, '\n').replace(/\r/gu, '\n');
}

export function splitFrontmatter(value: string): Frontmatter {
  const text = normalizeLf(value);
  if (!text.startsWith('---\n')) throw new ControlPlaneError('VALIDATION_INVALID');
  const end = text.indexOf('\n---\n', 4);
  if (end < 0) throw new ControlPlaneError('VALIDATION_INVALID');
  const fields: Record<string, string> = {};
  const lines = text.slice(4, end).split('\n');
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }
    const match = FIELD.exec(line);
    if (!match) throw new ControlPlaneError('VALIDATION_INVALID');
    const [, name, raw = ''] = match;
    if (Object.hasOwn(fields, name)) throw new ControlPlaneError('VALIDATION_INVALID');
    const block = raw === '>' || raw === '>-' || raw === '|' || raw === '|-';
    const nested = !raw && index + 1 < lines.length && /^\s/u.test(lines[index + 1]);
    if (block || nested) {
      index += 1;
      const parts: string[] = [];
      while (index < lines.length && (!lines[index] || /^\s/u.test(lines[index]))) {
        parts.push(lines[index].trim()); index += 1;
      }
      fields[name] = raw.startsWith('|') ? parts.join('\n').trim() : block ? parts.filter(Boolean).join(' ').trim() : parts.join('\n').trim();
      continue;
    }
    fields[name] = unquote(raw.trim());
    index += 1;
  }
  return Object.freeze({ fields: Object.freeze(fields), body: text.slice(end + 5) });
}

function unquote(value: string): string {
  return value.length >= 2 && value[0] === value.at(-1) && (value[0] === "'" || value[0] === '"')
    ? value.slice(1, -1) : value;
}

function scalar(value: string): string {
  return value.trim().split(/\s+/u).filter(Boolean).join(' ').replaceAll('"', '\\"');
}

export function serializeFrontmatter(fields: Readonly<Record<string, string>>, body: string): string {
  const lines = ['---'];
  for (const name of Object.keys(fields).sort()) lines.push(`${name}: "${scalar(fields[name])}"`);
  lines.push('---', '', normalizeLf(body).replace(/\n+$/u, ''), '');
  return lines.join('\n');
}

export function validateSkillFrontmatter(value: string): Frontmatter {
  const parsed = splitFrontmatter(value);
  const name = parsed.fields.name ?? '';
  const description = parsed.fields.description ?? '';
  if (!SKILL_NAME.test(name) || name.length > 64 || !description || description.length > 1024) {
    throw new ControlPlaneError('VALIDATION_INVALID');
  }
  return parsed;
}
