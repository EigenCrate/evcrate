export type FrontmatterValue = string | number | boolean | null | FrontmatterValue[];
export type Frontmatter = Record<string, FrontmatterValue>;

function scalar(value: string): FrontmatterValue {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1).replaceAll('\\"', '"');
  }
  if (trimmed === 'true' || trimmed === 'false') return trimmed === 'true';
  if (trimmed === 'null' || trimmed === '~') return null;
  if (/^-?\d+(?:\.\d+)?$/u.test(trimmed)) return Number(trimmed);
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed.slice(1, -1).split(',').map((item) => scalar(item)).filter((item) => item !== '');
  }
  return trimmed;
}

/** Parse the small YAML frontmatter dialect used by canonical agent files. */
export function parseMarkdownFrontmatter(content: string): { readonly data: Frontmatter; readonly body: string } {
  if (!content.startsWith('---')) return { data: {}, body: content };
  const match = /^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/u.exec(content);
  if (!match) return { data: {}, body: content };
  const data: Frontmatter = {};
  const lines = match[1].split('\n');
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim() || /^\s/u.test(line)) { index += 1; continue; }
    const separator = line.indexOf(':');
    if (separator < 1) { index += 1; continue; }
    const key = line.slice(0, separator).trim();
    const raw = line.slice(separator + 1).trim();
    if (raw === '|-' || raw === '|' || raw === '>-' || raw === '>') {
      const continuation: string[] = [];
      index += 1;
      while (index < lines.length && (/^\s/u.test(lines[index]) || !lines[index].trim())) {
        continuation.push(lines[index].trim()); index += 1;
      }
      data[key] = raw.startsWith('>') ? continuation.join(' ').trim() : continuation.join('\n').trim();
      continue;
    }
    if (!raw && index + 1 < lines.length && /^\s*-\s*/u.test(lines[index + 1])) {
      const values: FrontmatterValue[] = [];
      index += 1;
      while (index < lines.length && /^\s*-\s*/u.test(lines[index])) {
        values.push(scalar(lines[index].replace(/^\s*-\s*/u, ''))); index += 1;
      }
      data[key] = values;
      continue;
    }
    data[key] = scalar(raw);
    index += 1;
  }
  return { data, body: content.slice(match[0].length).replace(/^\s+/u, '') };
}

function yamlScalar(value: FrontmatterValue): string {
  if (value === null) return 'null';
  if (typeof value === 'string') {
    if (/^[A-Za-z0-9_./-]+$/u.test(value)) return value;
    return JSON.stringify(value);
  }
  return String(value);
}

export function writeMarkdownFrontmatter(data: Frontmatter, body: string): string {
  const lines = ['---'];
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) lines.push(`- ${yamlScalar(item)}`);
    } else lines.push(`${key}: ${yamlScalar(value)}`);
  }
  lines.push('---');
  return `${lines.join('\n')}\n${body}`;
}

export function writeToml(data: Record<string, string>): string {
  return Object.entries(data).map(([key, value]) => {
    if (value.includes('\n')) {
      const escaped = value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
      return `${key} = """${escaped}"""`;
    }
    return `${key} = ${JSON.stringify(value)}`;
  }).join('\n') + '\n';
}
