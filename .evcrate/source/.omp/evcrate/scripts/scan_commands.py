#!/usr/bin/env python3
def _load_omp_command_map(commands_dir):
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

"""
Scan .omp/commands directory and extract command metadata.
"""

import re
import json
import sys
from pathlib import Path
from typing import Dict, List
import yaml

def extract_frontmatter(content: str) -> Dict:
    """Extract YAML frontmatter from markdown content."""
    match = re.match(r'^---\s*\n(.*?)\n---\s*\n', content, re.DOTALL)
    if match:
        try:
            return yaml.safe_load(match.group(1))
        except:
            return {}
    return {}

def scan_commands(base_path: Path, command_map: Dict[str, Dict]) -> List[Dict]:
    """Scan all command files and extract metadata."""
    commands = []
    mapped_targets = set()

    for cmd_file in sorted(base_path.rglob('*.md')):
        # Get relative path from commands directory
        rel_path = cmd_file.relative_to(base_path)

        record = command_map.get(rel_path.as_posix())
        if record is None: raise RuntimeError(f'OMP command map has no record for {rel_path.as_posix()}')
        mapped_targets.add(rel_path.as_posix())
        command_name = '/' + record['targetName']
        source_parts = record['sourceName'].split(':')
        category = source_parts[0] if len(source_parts) > 1 else 'core'

        # Read file and extract frontmatter
        try:
            content = cmd_file.read_text()
            frontmatter = extract_frontmatter(content)

            description = frontmatter.get('description', '')
            arg_hint = frontmatter.get('argument-hint', '')

            # Extract power level (⚡ count)
            power_level = description.count('⚡')
            clean_desc = description.replace('⚡', '').strip()

            commands.append({
                'name': command_name,
                'path': str(rel_path),
                'description': clean_desc,
                'argument_hint': arg_hint,
                'power_level': power_level,
                'category': category
            })
        except Exception as e:
            print(f"Error processing {cmd_file}: {e}")

    return commands

def group_by_category(commands: List[Dict]) -> Dict[str, List[Dict]]:
    """Group commands by category."""
    categories = {}

    for cmd in commands:
        category = cmd['category']
        if category not in categories:
            categories[category] = []
        categories[category].append(cmd)

    return categories

def main():
    """Main execution."""
    base_path = Path('.omp/commands')

    if not base_path.exists():
        print(f"Error: {base_path} not found")
        return

    print("Scanning commands...")
    try:
        command_map = _load_omp_command_map(base_path)
        commands = scan_commands(base_path, command_map)
    except RuntimeError as error:
        print(f"Error: {error}", file=sys.stderr)
        raise SystemExit(1)

    print(f"\nFound {len(commands)} commands\n")

    # Group by category
    categories = group_by_category(commands)

    for category, cmds in sorted(categories.items()):
        print(f"\n{category.upper()}:")
        for cmd in cmds:
            power = '⚡' * cmd['power_level'] if cmd['power_level'] > 0 else ''
            print(f"  {cmd['name']:40} {power:10} {cmd['description'][:80]}")

    # Output YAML for processing (generate_catalogs.py expects YAML format)
    output_path = Path('.omp/evcrate/scripts/commands_data.yaml')
    output_path.write_text(yaml.dump(commands, allow_unicode=True, default_flow_style=False))
    print(f"\n✓ Saved metadata to {output_path}")

if __name__ == '__main__':
    main()
