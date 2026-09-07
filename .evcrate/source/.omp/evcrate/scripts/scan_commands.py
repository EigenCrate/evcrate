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

"""Scan commands directory and extract command metadata across target formats."""

from dataclasses import dataclass
import os
from pathlib import Path
import re
import json
import sys
import sys
import tempfile
from typing import Any, Callable, Dict, List, Optional, Set, Tuple
import yaml

sys.dont_write_bytecode = True

try:
    import tomllib
except ImportError:
    try:
        import tomli as tomllib  # type: ignore
    except ImportError:
        tomllib = None


class ScanError(Exception):
    """Raised when scanner validation or parsing fails."""
    pass


@dataclass(frozen=True)
class CommandLayout:
    root: Path
    format: str = "markdown"  # "markdown", "toml", or "command-skill"
    output_path: Optional[Path] = None
    managed_entries: Optional[Set[str]] = None
    name_map: Optional[Dict[str, Dict[str, str]]] = None
    name_resolver: Optional[Callable[[Path, Dict[str, Any]], Tuple[str, str]]] = None
    source_map: Optional[Dict[str, str]] = None

def atomic_write_yaml(output_path: Path, data: Any) -> None:
    """Atomically write data as UTF-8 YAML using an adjacent temporary file."""
    out = output_path.resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    temp = tempfile.NamedTemporaryFile(dir=out.parent, prefix=f".{out.name}.tmp.", delete=False)
    try:
        content = yaml.dump(data, allow_unicode=True, default_flow_style=False, sort_keys=False)
        temp.write(content.encode("utf-8"))
        temp.close()
        Path(temp.name).replace(out)
    finally:
        if os.path.exists(temp.name):
            os.unlink(temp.name)


def _validate_fields(data: Any, rel_path: str) -> Tuple[str, str]:
    if not isinstance(data, dict):
        raise ScanError(f"{rel_path}: metadata is not a mapping")
    desc = data.get("description")
    if not isinstance(desc, str) or not desc.strip():
        raise ScanError(f"{rel_path}: missing or invalid description (expected non-empty string)")
    hint = data.get("argument-hint", data.get("argument_hint", ""))
    if not isinstance(hint, str):
        raise ScanError(f"{rel_path}: invalid argument-hint (expected string)")
    return desc.strip(), hint


def parse_markdown_metadata(content: str, rel_path: str) -> Dict[str, Any]:
    match = re.match(r"^---\s*\n(.*?)\n---\s*\n", content, re.DOTALL)
    if not match:
        raise ScanError(f"{rel_path}: missing frontmatter")
    try:
        data = yaml.safe_load(match.group(1))
    except Exception as e:
        raise ScanError(f"{rel_path}: malformed YAML: {e}") from e
    desc, hint = _validate_fields(data, rel_path)
    return {"description": desc, "argument_hint": hint, "raw": data}


def parse_toml_metadata(content: str, rel_path: str) -> Dict[str, Any]:
    if tomllib is None:
        raise ScanError(f"{rel_path}: tomllib unavailable")
    try:
        data = tomllib.loads(content)
    except Exception as e:
        raise ScanError(f"{rel_path}: malformed TOML: {e}") from e
    desc, hint = _validate_fields(data, rel_path)
    return {"description": desc, "argument_hint": hint, "raw": data}


def parse_command_skill_metadata(content: str, rel_path: str) -> Dict[str, Any]:
    match = re.match(r"^---\s*\n(.*?)\n---\s*\n", content, re.DOTALL)
    if not match:
        raise ScanError(f"{rel_path}: missing frontmatter")
    try:
        data = yaml.safe_load(match.group(1))
    except Exception as e:
        raise ScanError(f"{rel_path}: malformed YAML: {e}") from e
    desc, hint = _validate_fields(data, rel_path)
    name = data.get("name")
    if name is not None and (not isinstance(name, str) or not name.strip()):
        raise ScanError(f"{rel_path}: invalid name (expected non-empty string)")
    return {"description": desc, "argument_hint": hint, "name": name.strip() if name else None, "raw": data}


def default_command_name_and_category(rel_path: Path) -> Tuple[str, str]:
    parts = list(rel_path.parts[:-1]) + [rel_path.stem]
    return "/evcrate:" + ":".join(parts), parts[0] if len(parts) > 1 else "core"


def scan_commands(base_path: Optional[Path] = None, layout: Optional[CommandLayout] = None) -> List[Dict]:
    target_root = base_path if base_path is not None else (layout.root if layout else Path("."))
    root = Path(target_root).resolve()
    if not root.is_dir():
        raise ScanError(f"Root path not found: {root}")
    layout = layout or CommandLayout(root=root, format="markdown")
    parsers = {"markdown": parse_markdown_metadata, "toml": parse_toml_metadata, "command-skill": parse_command_skill_metadata}
    if layout.format not in parsers:
        raise ScanError(f"Unsupported format: {layout.format}")
    parser = parsers[layout.format]

    if layout.managed_entries is not None:
        files = []
        for entry in sorted(layout.managed_entries):
            p = (root / entry).resolve()
            if not p.is_relative_to(root) or (root / entry).is_symlink() or not p.is_file():
                raise ScanError(f"Managed entry missing or unsafe: {entry}")
            files.append(root / entry)
    else:
        pat = {"markdown": "*.md", "toml": "*.toml", "command-skill": "SKILL.md"}[layout.format]
        files = [p for p in sorted(root.rglob(pat)) if not p.is_symlink() and p.is_file()]

    commands, seen_names = [], set()
    for cmd_file in files:
        rel, posix_rel = cmd_file.relative_to(root), cmd_file.relative_to(root).as_posix()
        try:
            content = cmd_file.read_text(encoding="utf-8")
        except UnicodeDecodeError as e:
            raise ScanError(f"{posix_rel}: invalid UTF-8 encoding: {e}") from e
        except OSError as e:
            raise ScanError(f"{posix_rel}: failed to read file: {e}") from e

        meta = parser(content, posix_rel)
        source = posix_rel
        if layout.name_resolver:
            cmd_name, category = layout.name_resolver(rel, meta["raw"])
        elif layout.name_map:
            rec = layout.name_map.get(posix_rel)
            if not rec:
                raise ScanError(f"Command map missing entry for: {posix_rel}")
            cmd_name = "/" + rec["targetName"]
            src_parts = rec.get("sourceName", "").split(":")
            category = src_parts[0] if len(src_parts) > 1 else "core"
            source = rec.get("source", posix_rel)
        elif layout.format == "command-skill" and meta.get("name"):
            cmd_name, category = "/" + meta["name"], "core"
        else:
            cmd_name, category = default_command_name_and_category(rel)

        if layout.source_map and posix_rel in layout.source_map:
            source = layout.source_map[posix_rel]

        if cmd_name in seen_names:
            raise ScanError(f"Duplicate command name collision: {cmd_name} from {posix_rel}")
        seen_names.add(cmd_name)
        commands.append({
            "source": source, "name": cmd_name, "path": posix_rel,
            "description": meta["description"], "argument_hint": meta["argument_hint"], "category": category,
        })
    commands.sort(key=lambda x: x["name"])
    return commands


def group_by_category(commands: List[Dict]) -> Dict[str, List[Dict]]:
    categories: Dict[str, List[Dict]] = {}
    for cmd in commands:
        categories.setdefault(cmd["category"], []).append(cmd)
    return categories


def main() -> None:
    script_dir = Path(__file__).resolve().parent
    base_path = (script_dir.parent / "commands").resolve()
    output_path = script_dir / "commands_data.yaml"
    if not base_path.is_dir():
        print(f"Error: {base_path} not found", file=sys.stderr)
        sys.exit(1)
    print("Scanning commands...")
    try:
        try:
        command_map = _load_omp_command_map(base_path)
        commands = scan_commands(base_path, command_map)
    except RuntimeError as error:
        print(f"Error: {error}", file=sys.stderr)
        raise SystemExit(1)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    print(f"\nFound {len(commands)} commands\n")
    for category, cmds in sorted(group_by_category(commands).items()):
        print(f"\n{category.upper()}:")
        for cmd in cmds:
            print(f"  {cmd['name']:45} {cmd['description'][:80]}")
    try:
        atomic_write_yaml(output_path, commands)
        print(f"\n✓ Saved metadata to {output_path}")
    except Exception as e:
        print(f"Error saving metadata: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
