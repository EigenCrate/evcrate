import { ControlPlaneError } from '../../errors/control-plane-error.js';
import type { ProjectionBuildContext } from '../types.js';
import { copy, filesUnder, json, productionFiles, relativeTo, writeJson, writeText } from './resources.js';
import { renderCommandReferences, translateHarnessReferences, type CommandMap } from './commands.js';
import { OMP_POLICY_MODULE, OMP_POST_MODULE, OMP_PRE_MODULE, OMP_RUNTIME_HELPER } from './templates.js';

const MAP_LOADER = String.raw`def _load_omp_command_map(commands_dir):
    import json, re
    map_path = commands_dir.parent / "evcrate" / "command-name-map.json"
    try:
        payload = json.loads(map_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, ValueError) as error:
        raise RuntimeError(f"Invalid or missing OMP command map: {map_path}") from error
    if not isinstance(payload, dict) or set(payload) != {"schema", "commands"} or payload["schema"] != "evcrate-omp-command-map-v1" or not isinstance(payload["commands"], list):
        raise RuntimeError(f"Invalid OMP command map schema: {map_path}")
    result = {}
    names = set()
    sources = set()
    for record in payload["commands"]:
        if not isinstance(record, dict) or set(record) != {"source", "sourceName", "target", "targetName"} or any(not isinstance(record[k], str) for k in record):
            raise RuntimeError(f"Invalid OMP command map record: {map_path}")
        source, source_name, target, target_name = (record[k] for k in ("source", "sourceName", "target", "targetName"))
        if source != source_name.replace(":", "/") + ".md" or not re.fullmatch(r"[A-Za-z0-9_-]+(?::[A-Za-z0-9_-]+)*", source_name) or target != target_name + ".md" or not re.fullmatch(r"cmd-[A-Za-z0-9][A-Za-z0-9_-]*", target_name) or target_name.casefold() in names or source_name.casefold() in sources:
            raise RuntimeError(f"Invalid or duplicate OMP command map record: {map_path}")
        candidate = commands_dir / target
        if candidate.is_symlink() or not candidate.is_file(): raise RuntimeError(f"OMP command map target is missing or unsafe: {target}")
        result[target] = record; names.add(target_name.casefold()); sources.add(source_name.casefold())
    actual = {path.relative_to(commands_dir).as_posix() for path in commands_dir.rglob("*.md")}
    if actual != set(result): raise RuntimeError(f"OMP command map does not match command files: {map_path}")
    return result
`;
function invalid(): never { throw new ControlPlaneError('VALIDATION_INVALID'); }
function scriptTransform(value: string, relative: string, map: CommandMap): string {
  let rendered = renderCommandReferences(translateHarnessReferences(value), map);
  if (relative === 'ev-help.py') {
    rendered = rendered.replace('import ast\n', 'import ast\nimport json\n');
    rendered = rendered.replace('def discover_commands(commands_dir: Path, prefix: str) -> dict:', 'def discover_commands(commands_dir: Path, prefix: str, command_map: dict | None = None) -> dict:');
    rendered = rendered.replace('    commands = {}\n    categories = {}', '    commands = {}\n    categories = {}\n    mapped_targets = set()');
    rendered = rendered.replace('        # Get command name from path\n        # e.g., fix/fast.md -> fix:fast, plan.md -> plan\n        if len(parts) == 1:\n            # Root command: plan.md or plan.toml -> plan\n            cmd_name = command_file.stem\n            category = "core"\n        else:\n            # Nested command: fix/fast.md -> fix:fast\n            category = parts[0]\n            cmd_name = \':\'.join([*parts[:-1], command_file.stem])', '        if command_map is not None:\n            record = command_map.get(rel_path.as_posix())\n            if record is None: raise RuntimeError(f"OMP command map has no record for {rel_path.as_posix()}")\n            mapped_targets.add(rel_path.as_posix())\n            cmd_name = record["targetName"]\n            category = parts[0] if len(parts) > 1 else "core"\n        else:\n            cmd_name = command_file.stem if len(parts) == 1 else \':\'.join([*parts[:-1], command_file.stem])\n            category = "core" if len(parts) == 1 else parts[0]');
    rendered = rendered.replace('        formatted_name = f"/{prefix}{cmd_name}" if prefix else f"/{cmd_name}"', '        formatted_name = f"/{cmd_name}" if command_map is not None else (f"/{prefix}{cmd_name}" if prefix else f"/{cmd_name}")');
    rendered = rendered.replace('    script_path = Path(__file__).resolve()\n    source_kind, source_dir = resolve_command_source(script_path)', '    script_path = Path(__file__).resolve()\n    source_kind, source_dir = resolve_command_source(script_path)\n    command_map = _load_omp_command_map(source_dir) if source_dir.name == "commands" and source_dir.parent.name == ".omp" else None');
    const shebang = rendered.match(/^#![^\n]*\n/u)?.[0] ?? '';
    rendered = shebang + MAP_LOADER + '\n' + rendered.slice(shebang.length);
  } else if (relative === 'scan_commands.py') {
    rendered = rendered.replace('import re\n', 'import re\nimport json\nimport sys\n');
    rendered = rendered.replace("def scan_commands(base_path: Path) -> List[Dict]:", "def scan_commands(base_path: Path, command_map: Dict[str, Dict]) -> List[Dict]:");
    rendered = rendered.replace('    commands = []\n\n    for cmd_file', '    commands = []\n    mapped_targets = set()\n\n    for cmd_file');
    rendered = rendered.replace("        # Build command name from path\n        parts = list(rel_path.parts[:-1]) + [rel_path.stem]\n        command_name = '/ck:' + ':'.join(parts)", "        record = command_map.get(rel_path.as_posix())\n        if record is None: raise RuntimeError(f'OMP command map has no record for {rel_path.as_posix()}')\n        mapped_targets.add(rel_path.as_posix())\n        command_name = '/' + record['targetName']\n        source_parts = record['sourceName'].split(':')\n        category = source_parts[0] if len(source_parts) > 1 else 'core'");
    rendered = rendered.replace("'category': parts[0] if len(parts) > 1 else 'core'", "'category': category");
    rendered = rendered.replace("    base_path = Path('.claude/commands')", "    base_path = Path('.omp/commands')");
    rendered = rendered.replace('    commands = scan_commands(base_path)', `    try:\n        command_map = _load_omp_command_map(base_path)\n        commands = scan_commands(base_path, command_map)\n    except RuntimeError as error:\n        print(f"Error: {error}", file=sys.stderr)\n        raise SystemExit(1)`);
    const shebang = rendered.match(/^#![^\n]*\n/u)?.[0] ?? '';
    rendered = shebang + MAP_LOADER + '\n' + rendered.slice(shebang.length);
  }
  return rendered;
}
function catalogTransform(value: string, map: CommandMap): string {
  const lines = value.split(/\r?\n/u);
  const output: string[] = [];
  let index = 0;
  const seen = new Set<string>();
  while (index < lines.length) {
    if (!lines[index].startsWith('- name: ')) { output.push(lines[index]); index += 1; continue; }
    const start = index;
    index += 1;
    while (index < lines.length && !lines[index].startsWith('- name: ')) index += 1;
    const record = lines.slice(start, index);
    const name = /^- name: \/evcrate:(.+)$/u.exec(record[0])?.[1];
    const source = /^  path: (.+)$/mu.exec(record.join('\n'))?.[1];
    if (!name || !source) invalid();
    const item = Object.values(map).find((candidate) => candidate.source === source && candidate.sourceName === name);
    if (!item || seen.has(name)) invalid();
    seen.add(name);
    output.push(...record.map((line) => line === record[0] ? `- name: /${item.targetName}` : line === `  path: ${source}` ? `  path: ${item.target}` : line));
  }
  return output.join('\n');
}
export function convertHooksAndScripts(context: ProjectionBuildContext, map: CommandMap): { hooks: string[]; scripts: string[]; modules: string[] } {
  const hooks: string[] = []; const scripts: string[] = [];
  for (const entry of productionFiles(context, 'hooks')) { const rel = relativeTo(entry.path, 'hooks'); if (!rel) continue; copy(context, entry.path, `evcrate/hooks/${rel}`, (value) => renderCommandReferences(translateHarnessReferences(value), map)); hooks.push(rel); }
  for (const entry of productionFiles(context, 'scripts')) { const rel = relativeTo(entry.path, 'scripts'); if (!rel || rel.includes('advise-state')) continue; copy(context, entry.path, `evcrate/scripts/${rel}`, (value) => rel === 'commands_data.yaml' ? catalogTransform(value, map) : scriptTransform(value, rel, map)); scripts.push(rel); }
  copy(context, '.evcrateignore', 'evcrate/.evcrateignore'); copy(context, '.evcrate.json', '.evcrate.json'); copy(context, '.evcrateignore', '.evcrateignore');
  for (const [source, target] of [['settings.json', 'claude-settings.json'], ['.mcp.json.example', '.mcp.json.example'] as const]) if (filesUnder(context, source).length) copy(context, source, `evcrate/source-metadata/${target}`, (value) => renderCommandReferences(translateHarnessReferences(value), map));
  for (const entry of context.resources.files.filter((item) => item.path.startsWith('statusline.') && !item.path.includes('/'))) copy(context, entry.path, `evcrate/source-metadata/statusline/${entry.path}`, (value) => renderCommandReferences(translateHarnessReferences(value), map));
  writeText(context, 'evcrate/omp-hook-runtime.ts', OMP_RUNTIME_HELPER);
  const generated: Record<string, string> = { 'hooks/pre/evcrate-context.ts': OMP_PRE_MODULE, 'hooks/pre/evcrate-policy.ts': OMP_POLICY_MODULE, 'hooks/post/evcrate-results.ts': OMP_POST_MODULE };
  for (const [path, value] of Object.entries(generated)) writeText(context, path, value);
  const settings = json(context, 'settings.json'); const events = settings.hooks;
  if (events === null || typeof events !== 'object' || Array.isArray(events)) invalid();
  const eventMap: Record<string, unknown> = {};
  for (const [event, entries] of Object.entries(events as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))) {
    if (!Array.isArray(entries)) invalid();
    const targets: Record<string, string[]> = { SessionStart: ['session_start', 'before_agent_start'], UserPromptSubmit: ['before_agent_start'], PreToolUse: ['tool_call'], PostToolUse: ['tool_result'], PreCompact: ['session_before_compact'], SessionEnd: ['session_shutdown'], SubagentStart: [] };
    eventMap[event] = { targetEvents: targets[event] ?? [], status: targets[event] ? (event === 'SubagentStart' ? 'limited' : 'migrated') : 'unsupported', sourceEntries: entries.length };
  }
  writeJson(context, 'evcrate/hook-map.json', { schema: 'evcrate-omp-hook-map-v1', events: eventMap, activeModules: Object.keys(generated).sort(), subagentStart: 'OMP has no direct agent_type/agent_id hook payload; generic context is handled by before_agent_start.' });
  return { hooks, scripts, modules: Object.keys(generated).sort() };
}
