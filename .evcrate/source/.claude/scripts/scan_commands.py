#!/usr/bin/env python3
"""Scan commands directory and extract command metadata across target formats."""

from dataclasses import dataclass
import json
from pathlib import Path
import re
import sys
import secrets
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
    temp_path = out.with_name(f".{out.name}.tmp.{secrets.token_hex(16)}")
    try:
        with temp_path.open("xb") as temp:
            content = yaml.dump(data, allow_unicode=True, default_flow_style=False, sort_keys=False, width=1000000)
            temp.write(content.encode("utf-8"))
        temp_path.replace(out)
    finally:
        temp_path.unlink(missing_ok=True)


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


COMMAND_PREFIX = "evc-cmd-"
SEGMENT_SEPARATOR = "-x-"
_KEBAB_NAME = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def command_segments_from_stem(stem: str) -> List[str]:
    """Split a flat command stem (`evc-cmd-a-x-b`) into semantic segments (['a', 'b'])."""
    if "/" in stem or "\\" in stem:
        raise ScanError(f"Command source must be a flat file, got nested path: {stem!r}")
    if not _KEBAB_NAME.fullmatch(stem) or not stem.startswith(COMMAND_PREFIX):
        raise ScanError(f"Command name must be kebab-case with '{COMMAND_PREFIX}' prefix: {stem!r}")
    segments = stem[len(COMMAND_PREFIX):].split(SEGMENT_SEPARATOR)
    for segment in segments:
        if not segment or "x" in segment.split("-"):
            raise ScanError(f"Invalid command segment {segment!r} in {stem!r}")
    return segments


def command_semantic_name(source: str) -> str:
    """Semantic colon form (`a:b`) of a flat command source path or stem (optional `.md`)."""
    stem = source[:-3] if source.endswith(".md") else source
    return ":".join(command_segments_from_stem(stem))


def default_command_name_and_category(rel_path: Path) -> Tuple[str, str]:
    if len(rel_path.parts) != 1:
        raise ScanError(f"Command source must be a flat file, got nested path: {rel_path.as_posix()}")
    segments = command_segments_from_stem(rel_path.stem)
    return "/" + rel_path.stem, segments[0] if len(segments) > 1 else "core"


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
            segments = command_segments_from_stem(meta["name"])
            cmd_name, category = "/" + meta["name"], segments[0] if len(segments) > 1 else "core"
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


def resolve_command_layout(script_dir: Path) -> CommandLayout:
    layout_file = script_dir / "scanner-layout.json"
    if not layout_file.is_file():
        base_path = (script_dir.parent / "commands").resolve()
        if not base_path.is_dir():
            raise ScanError(f"Root path not found: {base_path}")
        return CommandLayout(root=base_path, format="markdown", output_path=script_dir / "commands_data.yaml")

    try:
        data = json.loads(layout_file.read_text(encoding="utf-8"))
    except Exception as e:
        raise ScanError(f"Invalid scanner-layout.json: {e}") from e

    if not isinstance(data, dict) or data.get("schema") != "evcrate-scanner-layout-v1":
        raise ScanError(f"Invalid layout schema: {data.get('schema') if isinstance(data, dict) else type(data)}")

    cmd_cfg = data.get("commands")
    if not isinstance(cmd_cfg, dict):
        raise ScanError("Missing or invalid 'commands' block in layout")

    root = (script_dir / cmd_cfg["root"]).resolve()
    if not root.is_dir():
        raise ScanError(f"Command root path not found: {root}")

    out_name = cmd_cfg.get("output", "commands_data.yaml")
    output_path = (script_dir / out_name).resolve()
    if not output_path.is_relative_to(script_dir) or output_path.parent != script_dir:
        raise ScanError(f"Unsafe output path: {out_name}")
    fmt = cmd_cfg.get("format", "markdown")
    auth_rel = cmd_cfg.get("authority")

    if not auth_rel:
        return CommandLayout(root=root, format=fmt, output_path=output_path)

    auth_file = (script_dir / auth_rel).resolve()
    if not auth_file.is_file() or auth_file.is_symlink():
        raise ScanError(f"Authoritative map missing or unsafe: {auth_file}")

    managed: Set[str] = set()
    name_map: Dict[str, Dict[str, str]] = {}
    source_map: Dict[str, str] = {}

    if auth_file.suffix in (".yaml", ".yml"):
        try:
            auth_data = yaml.safe_load(auth_file.read_text(encoding="utf-8"))
        except Exception as e:
            raise ScanError(f"Malformed authority YAML in {auth_file}: {e}") from e
        if not isinstance(auth_data, list):
            raise ScanError(f"Authority YAML root must be a list in {auth_file}")
        for item in auth_data:
            if isinstance(item, dict) and "source" in item:
                src = item["source"]
                if not isinstance(src, str) or not src.endswith(".md"):
                    raise ScanError(f"Authority YAML source must be a flat .md file name: {src!r}")
                sname = command_semantic_name(src)
                name = item.get("name", "")
                tname = name[1:] if isinstance(name, str) and name.startswith("/") else name
                if not isinstance(tname, str):
                    raise ScanError(f"Authority YAML name must be a string for {src}")
                command_segments_from_stem(tname)
                managed.add(src)
                name_map[src] = {"source": src, "targetName": tname, "sourceName": sname}
                source_map[src] = src
        return CommandLayout(root=root, format=fmt, output_path=output_path, managed_entries=managed, name_map=name_map, source_map=source_map)

    try:
        auth_data = json.loads(auth_file.read_text(encoding="utf-8"))
    except Exception as e:
        raise ScanError(f"Malformed authority JSON in {auth_file}: {e}") from e
    if not isinstance(auth_data, dict):
        raise ScanError(f"Authority JSON root must be a mapping in {auth_file}")

    schema = auth_data.get("schema")
    if schema in ("evcrate-omp-command-map-v1", "evcrate-copilot-command-map-v1"):
        cmds = auth_data.get("commands")
        if not isinstance(cmds, list):
            raise ScanError(f"Missing 'commands' list in {auth_file}")
        for item in cmds:
            if not isinstance(item, dict):
                raise ScanError(f"Invalid command record in {auth_file}")
            src, target, tname = item.get("source"), item.get("target"), item.get("targetName")
            if not src or not target or not tname:
                raise ScanError(f"Incomplete command record in {auth_file}")
            sname = item.get("sourceName") or command_semantic_name(src)
            rel_target = target
            if rel_target.startswith("skills/") and root.name == "skills":
                rel_target = rel_target[len("skills/"):]
            if rel_target in managed:
                raise ScanError(f"Duplicate target in {auth_file}: {rel_target}")
            managed.add(rel_target)
            name_map[rel_target] = {"source": src, "targetName": tname, "sourceName": sname}
            source_map[rel_target] = src
    elif "commands" in auth_data and isinstance(auth_data["commands"], list):
        for cmd in auth_data["commands"]:
            if not isinstance(cmd, str):
                raise ScanError(f"Invalid command string in {auth_file}")
            rel_target = cmd + ".md" if not cmd.endswith(".md") else cmd
            if rel_target in managed:
                raise ScanError(f"Duplicate command in {auth_file}: {rel_target}")
            managed.add(rel_target)
            sname = command_semantic_name(rel_target)
            name_map[rel_target] = {"source": rel_target, "targetName": rel_target[:-3], "sourceName": sname}
            source_map[rel_target] = rel_target
    elif "behaviors" in auth_data and isinstance(auth_data["behaviors"], list):
        for b in auth_data["behaviors"]:
            if isinstance(b, dict) and b.get("kind") == "command-prose" and b.get("status") == "migrated":
                src = b.get("source")
                raw_target = b.get("target")
                if not src or not raw_target:
                    raise ScanError(f"Incomplete command-prose behavior in {auth_file}")
                rel_target = raw_target
                for pfx in [".agents/skills/", ".antigravity/skills/", "skills/"]:
                    if rel_target.startswith(pfx) and (root.name == "skills" or root.name == ".agents"):
                        rel_target = rel_target[len(pfx):]
                if rel_target in managed:
                    raise ScanError(f"Duplicate command target in {auth_file}: {rel_target}")
                managed.add(rel_target)
                src_stem = src[:-3] if src.endswith(".md") else src
                sname = command_semantic_name(src_stem)
                tname = b.get("target_name") or src_stem
                name_map[rel_target] = {"source": src, "targetName": tname, "sourceName": sname}
                source_map[rel_target] = src
    else:
        raise ScanError(f"Unrecognized authority schema in {auth_file}")

    if not managed:
        raise ScanError(f"No managed command entries resolved from {auth_file}")

    return CommandLayout(
        root=root, format=fmt, output_path=output_path,
        managed_entries=managed, name_map=name_map, source_map=source_map
    )


def main() -> None:
    script_dir = Path(__file__).resolve().parent
    try:
        layout = resolve_command_layout(script_dir)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    print(f"Scanning commands in {layout.root}...")
    try:
        commands = scan_commands(layout=layout)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    print(f"\nFound {len(commands)} commands\n")
    for category, cmds in sorted(group_by_category(commands).items()):
        print(f"\n{category.upper()}:")
        for cmd in cmds:
            print(f"  {cmd['name']:45} {cmd['description'][:80]}")
    try:
        out_path = layout.output_path or (script_dir / "commands_data.yaml")
        atomic_write_yaml(out_path, commands)
        print(f"\n✓ Saved metadata to {out_path}")
    except Exception as e:
        print(f"Error saving metadata: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
