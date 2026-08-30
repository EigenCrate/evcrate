#!/usr/bin/env python3
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

def _load_omp_command_map(commands_dir: Path) -> dict[str, dict]:
    """Load the generated OMP map and prove it matches command files."""
    map_path = commands_dir.parent / "evcrate" / "command-name-map.json"

    def reject_duplicate_keys(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError(f"duplicate key: {key}")
            result[key] = value
        return result

    try:
        payload = json.loads(
            map_path.read_text(encoding="utf-8"),
            object_pairs_hook=reject_duplicate_keys,
        )
    except (OSError, UnicodeError, ValueError) as error:
        raise RuntimeError(f"Invalid or missing OMP command map: {map_path}") from error
    if (
        not isinstance(payload, dict)
        or set(payload) != {"schema", "commands"}
        or payload["schema"] != "evcrate-omp-command-map-v1"
    ):
        raise RuntimeError(f"Invalid OMP command map schema: {map_path}")
    records = payload["commands"]
    if not isinstance(records, list):
        raise RuntimeError(f"Invalid OMP command map records: {map_path}")

    by_target = {}
    seen_sources = set()
    seen_source_names = set()
    seen_target_names = set()
    for record in records:
        fields = ("source", "sourceName", "target", "targetName")
        if (
            not isinstance(record, dict)
            or set(record) != set(fields)
            or any(not isinstance(record[field], str) for field in fields)
        ):
            raise RuntimeError(f"Invalid OMP command map record: {map_path}")
        source = record["source"]
        source_name = record["sourceName"]
        target = record["target"]
        target_name = record["targetName"]
        source_path = Path(source)
        target_path = Path(target)
        if (
            source != source_name.replace(":", "/") + ".md"
            or not re.fullmatch(r"[A-Za-z0-9_-]+(?::[A-Za-z0-9_-]+)*", source_name)
            or source_path.is_absolute()
            or source_path.as_posix() != source
            or ".." in source_path.parts
            or target != f"{target_name}.md"
            or not re.fullmatch(r"cmd-[A-Za-z0-9][A-Za-z0-9_-]*", target_name)
            or target_path.is_absolute()
            or target_path.as_posix() != target
            or ".." in target_path.parts
            or source_name.casefold() in seen_source_names
            or target_name.casefold() in seen_target_names
        ):
            raise RuntimeError(f"Invalid or duplicate OMP command map record: {map_path}")
        candidate = commands_dir / target_path
        try:
            candidate.relative_to(commands_dir)
        except ValueError as error:
            raise RuntimeError(f"OMP command map target escapes command root: {map_path}") from error
        if candidate.is_symlink() or not candidate.is_file():
            raise RuntimeError(f"OMP command map target is missing or unsafe: {target}")
        by_target[target] = record
        seen_source_names.add(source_name.casefold())
        seen_target_names.add(target_name.casefold())

    command_targets = {
        path.relative_to(commands_dir).as_posix()
        for path in commands_dir.rglob("*.md")
    }
    if command_targets != set(by_target):
        raise RuntimeError(f"OMP command map does not match command files: {map_path}")
    return by_target

def scan_commands(base_path: Path, command_map: Dict[str, Dict]) -> List[Dict]:
    """Scan all command files and extract metadata."""
    commands = []
    mapped_targets = set()

    for cmd_file in sorted(base_path.rglob('*.md')):
        # Get relative path from commands directory
        rel_path = cmd_file.relative_to(base_path)

        record = command_map.get(rel_path.as_posix())
        if record is None:
            raise RuntimeError(f"OMP command map has no record for {rel_path.as_posix()}")
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

    if mapped_targets != set(command_map):
        raise RuntimeError('OMP command map does not match discovered commands')

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

def _omp_root() -> Path:
    for current in (Path.cwd(), *Path.cwd().parents):
        candidate = current / '.omp'
        if candidate.is_dir():
            return candidate
    return Path.home() / '.omp' / 'agent'

def main():
    """Main execution."""
    base_path = _omp_root() / 'commands'

    if base_path.is_symlink() or not base_path.is_dir():
        print(f"Error: {base_path} not found", file=sys.stderr)
        raise SystemExit(1)

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
    output_path = _omp_root() / 'evcrate' / 'scripts' / 'commands_data.yaml'
    output_path.write_text(yaml.dump(commands, allow_unicode=True, default_flow_style=False))
    print(f"\n✓ Saved metadata to {output_path}")

if __name__ == '__main__':
    main()
