export const COMMAND_KEYS = ['source', 'name', 'path', 'description', 'argument_hint', 'category'] as const;
export const SKILL_KEYS = ['source', 'name', 'path', 'description', 'category', 'has_scripts', 'has_references'] as const;

export const VALID_CMD_CATS: Record<string, true> = {
  core: true, bootstrap: true, code: true, content: true, cook: true, design: true, docs: true,
  fix: true, git: true, integrate: true, plan: true, review: true, scout: true, skill: true, test: true
};

export const VALID_SKILL_CATS: Record<string, true> = {
  'ai-ml': true, frontend: true, backend: true, infrastructure: true, database: true,
  'dev-tools': true, multimedia: true, frameworks: true, utilities: true, other: true
};

export interface CommandCatalogRecord {
  source: string;
  name: string;
  path: string;
  description: string;
  argument_hint: string;
  category: string;
}

export interface SkillCatalogRecord {
  source: string;
  name: string;
  path: string;
  description: string;
  category: string;
  has_scripts: boolean;
  has_references: boolean;
}

export interface ScannerLayout {
  schema: 'evcrate-scanner-layout-v1';
  target: string;
  commands: {
    format: 'markdown' | 'toml' | 'command-skill';
    root: string;
    output: string;
    authority: string | null;
  };
  skills: {
    root: string;
    output: string;
    authority: string | null;
  };
}

export interface TargetCatalogMapping {
  target: string;
  scriptDirectory: string;
  commands: {
    format: 'markdown' | 'toml' | 'command-skill';
    root: string;
    output?: string;
    authorityPath: string | null;
    mapRecord: (canonical: CommandCatalogRecord) => {
      name: string;
      path: string;
      description?: string;
      argument_hint?: string;
      category?: string;
    };
  };
  skills: {
    root: string;
    output?: string;
    authorityPath: string | null;
    mapRecord: (canonical: SkillCatalogRecord) => {
      name: string;
      path: string;
      description?: string;
      category?: string;
    } | null;
  };
}

export function isSafePosixPath(p: unknown): boolean {
  if (typeof p !== 'string' || !p.trim() || p.includes('\0') || p.includes('\\')) return false;
  if (p.startsWith('/') || p.startsWith('./')) return false;
  const parts = p.split('/');
  return !parts.some((part) => part === '' || part === '.' || part === '..');
}

export function escapeYamlString(val: string): string {
  if (val === '') return "''";
  if (/^[:\s\-?\[\]{}#&*!|>'"%@`]|[:#]|[\n\r]|\s$/u.test(val) || val === 'true' || val === 'false' || val === 'null' || !isNaN(Number(val))) {
    return `'${val.replace(/'/g, "''")}'`;
  }
  return val;
}

export function parseCatalogYaml(content: string): Record<string, unknown>[] {
  const records: Record<string, unknown>[] = [];
  let current: Record<string, unknown> | null = null;
  let currentKey: string | null = null;
  let currentRaw: string = '';

  const flushKey = () => {
    if (current && currentKey) {
      current[currentKey] = parseYamlScalar(currentRaw);
      currentKey = null;
      currentRaw = '';
    }
  };

  for (const line of content.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (line.startsWith('- source:')) {
      flushKey();
      if (current) records.push(current);
      current = {};
      const val = line.slice('- source:'.length).trim();
      current['source'] = parseYamlScalar(val);
      continue;
    }
    const match = line.match(/^\s{2}([a-z_]+):\s*(.*)$/);
    if (match) {
      flushKey();
      currentKey = match[1];
      currentRaw = match[2].trim();
      continue;
    }
    if (current && currentKey && (line.startsWith('    ') || line.startsWith('  '))) {
      const continuation = line.trim();
      currentRaw = currentRaw ? `${currentRaw} ${continuation}` : continuation;
    }
  }
  flushKey();
  if (current) records.push(current);
  return records;
}

function parseYamlScalar(val: string): unknown {
  const trimmed = val.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    try { return JSON.parse(trimmed); } catch { return trimmed.slice(1, -1); }
  }
  return trimmed;
}

export function serializeCommandYaml(records: readonly CommandCatalogRecord[]): string {
  const sorted = [...records].sort((a, b) => a.name.localeCompare(b.name));
  const lines: string[] = [];
  for (const r of sorted) {
    lines.push(`- source: ${escapeYamlString(r.source)}`);
    lines.push(`  name: ${escapeYamlString(r.name)}`);
    lines.push(`  path: ${escapeYamlString(r.path)}`);
    lines.push(`  description: ${escapeYamlString(r.description)}`);
    lines.push(`  argument_hint: ${escapeYamlString(r.argument_hint)}`);
    lines.push(`  category: ${escapeYamlString(r.category)}`);
  }
  return lines.join('\n') + '\n';
}

export function serializeSkillYaml(records: readonly SkillCatalogRecord[]): string {
  const sorted = [...records].sort((a, b) => a.name.localeCompare(b.name));
  const lines: string[] = [];
  for (const r of sorted) {
    lines.push(`- source: ${escapeYamlString(r.source)}`);
    lines.push(`  name: ${escapeYamlString(r.name)}`);
    lines.push(`  path: ${escapeYamlString(r.path)}`);
    lines.push(`  description: ${escapeYamlString(r.description)}`);
    lines.push(`  category: ${escapeYamlString(r.category)}`);
    lines.push(`  has_scripts: ${r.has_scripts ? 'true' : 'false'}`);
    lines.push(`  has_references: ${r.has_references ? 'true' : 'false'}`);
  }
  return lines.join('\n') + '\n';
}
