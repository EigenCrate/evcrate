import { ControlPlaneError } from '../../errors/control-plane-error.js';

export interface ParsedFrontmatter {
  readonly fields: Readonly<Record<string, unknown>>;
  readonly rawFields: Readonly<Record<string, string>>;
  readonly body: string;
}

export function parseYamlScalar(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null' || trimmed === '~') return null;
  if (/^-?\d+$/u.test(trimmed)) {
    const num = Number(trimmed);
    if (Number.isSafeInteger(num)) return num;
  }
  if (/^-?\d+\.\d+$/u.test(trimmed)) {
    const num = Number(trimmed);
    if (!Number.isNaN(num)) return num;
  }
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const inner = trimmed.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map((item) => {
      const parsed = parseYamlScalar(item.trim());
      return parsed;
    });
  }
  return trimmed;
}

export function formatYamlScalar(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return `[${value.map((v) => formatYamlScalar(v)).join(', ')}]`;
  }
  const str = String(value);
  if (str === 'true' || str === 'false' || str === 'null' || /^-?\d+(\.\d+)?$/u.test(str)
      || /[:#\[\]{},&*!|>'"%@`]/u.test(str) || str.trim() !== str || str === '') {
    return JSON.stringify(str);
  }
  return str;
}

export function parseFrontmatter(text: string): ParsedFrontmatter {
  const normalized = text.replace(/\r\n?/gu, '\n');
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/u.exec(normalized);
  if (!match) {
    return {
      fields: Object.freeze({}),
      rawFields: Object.freeze({}),
      body: normalized
    };
  }

  const rawHeader = match[1];
  const body = match[2];
  const fields: Record<string, unknown> = {};
  const rawFields: Record<string, string> = {};
  const lines = rawHeader.split('\n');
  const seenKeys: Record<string, true> = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) continue;

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) {
      throw new ControlPlaneError('VALIDATION_INVALID');
    }

    const key = line.slice(0, colonIdx).trim();
    const rest = line.slice(colonIdx + 1).trim();

    if (!key || seenKeys[key]) {
      throw new ControlPlaneError('VALIDATION_INVALID');
    }
    seenKeys[key] = true;

    const isBlock = rest === '|' || rest === '|-' || rest === '>' || rest === '>-';
    const isList = rest === '' && i + 1 < lines.length && /^\s*-\s*/u.test(lines[i + 1]);
    const isIndented = !rest && i + 1 < lines.length && /^\s/u.test(lines[i + 1]);

    if (isBlock || isList || isIndented) {
      const continuation: string[] = [];
      i += 1;
      while (i < lines.length && (!lines[i].trim() || /^\s/u.test(lines[i]))) {
        if (lines[i].trim()) {
          continuation.push(isList ? lines[i].replace(/^\s*-\s?/u, '').trim() : lines[i].trim());
        }
        i += 1;
      }
      i -= 1;

      if (isList) {
        fields[key] = continuation;
        rawFields[key] = continuation.join(', ');
      } else {
        const textVal = rest.startsWith('>') ? continuation.join(' ').trim() : continuation.join('\n').trim();
        fields[key] = textVal;
        rawFields[key] = textVal;
      }
    } else {
      rawFields[key] = rest;
      fields[key] = parseYamlScalar(rest);
    }
  }

  return {
    fields: Object.freeze(fields),
    rawFields: Object.freeze(rawFields),
    body
  };
}

export function serializeFrontmatter(fields: Record<string, unknown>, body: string): string {
  const lines = ['---'];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
      } else if (value.every((item) => typeof item === 'string' && !item.includes('\n'))) {
        lines.push(`${key}:`);
        for (const item of value) {
          lines.push(`  - ${formatYamlScalar(item)}`);
        }
      } else {
        lines.push(`${key}: ${formatYamlScalar(value)}`);
      }
    } else {
      lines.push(`${key}: ${formatYamlScalar(value)}`);
    }
  }
  lines.push('---', '');
  const cleanBody = body.replace(/\r\n?/gu, '\n').replace(/\n+$/u, '');
  if (cleanBody) {
    lines.push(cleanBody, '');
  }
  return lines.join('\n');
}
