#!/usr/bin/env python3
"""Generate updated command and skill catalogs.

Outputs YAML to stdout by default for easy consumption by Claude.
Use --output to write to a specific file instead.
"""

import argparse
import os
from datetime import datetime
from pathlib import Path
import sys
import tempfile
from typing import Any, Dict, List, Optional, Set, Tuple
import yaml
from scan_commands import ScanError, command_segments_from_stem

SCRIPT_DIR = Path(__file__).resolve().parent

try:
    from win_compat import ensure_utf8_stdout
    ensure_utf8_stdout()
except ImportError:
    if sys.platform == "win32" and hasattr(sys.stdout, "buffer"):
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")


class CatalogError(Exception):
    """Raised when catalog validation or data loading fails."""
    pass


COMMAND_KEYS: Tuple[str, ...] = ("source", "name", "path", "description", "argument_hint", "category")
SKILL_KEYS: Tuple[str, ...] = ("source", "name", "path", "description", "category", "has_scripts", "has_references")

VALID_CMD_CATS: Set[str] = {
    "core", "bootstrap", "code", "content", "cook", "design", "docs",
    "fix", "git", "integrate", "plan", "review", "scout", "skill", "test",
}
VALID_SKILL_CATS: Set[str] = {
    "ai-ml", "frontend", "backend", "infrastructure", "database",
    "dev-tools", "multimedia", "frameworks", "utilities", "other",
}

CMD_CAT_LABELS = {
    "core": "Core Commands", "bootstrap": "Bootstrap Commands", "code": "Coding & Implementation",
    "content": "Content Creation", "cook": "Cook Commands", "design": "Design Commands", "docs": "Documentation",
    "fix": "Fix & Debug", "git": "Git Commands", "integrate": "Integrations",
    "plan": "Planning", "review": "Code Review", "scout": "Scout Commands", "skill": "Skill Management",
    "test": "Testing",
}
SKILL_CAT_LABELS = {
    "ai-ml": "AI & Machine Learning", "frontend": "Frontend & Design", "backend": "Backend Development",
    "infrastructure": "Infrastructure & DevOps", "database": "Database & Storage", "dev-tools": "Development Tools",
    "multimedia": "Multimedia & Processing", "frameworks": "Frameworks & Platforms",
    "utilities": "Utilities & Helpers", "other": "Other",
}

def is_safe_posix_path(p: str) -> bool:
    if not isinstance(p, str) or not p.strip() or "\0" in p or "\\" in p or p.startswith("/") or p.startswith("./"):
        return False
    parts = p.split("/")
    return not any(x in ("", ".", "..") for x in parts) and Path(p).as_posix() == p and not Path(p).is_absolute()


def validate_command_records(records: Any) -> List[Dict[str, str]]:
    if not isinstance(records, list):
        raise CatalogError(f"Command data root must be a list, got {type(records).__name__}")
    validated, seen_src, seen_name, seen_path = [], set(), set(), set()
    for idx, item in enumerate(records):
        pfx = f"Command record #{idx + 1}"
        if not isinstance(item, dict):
            raise CatalogError(f"{pfx} must be a mapping, got {type(item).__name__}")
        if tuple(item.keys()) != COMMAND_KEYS:
            raise CatalogError(f"{pfx} exact keys must be {COMMAND_KEYS}, got {tuple(item.keys())}")
        for k in COMMAND_KEYS:
            v = item[k]
            if not isinstance(v, str):
                raise CatalogError(f"{pfx} field '{k}' must be string, got {type(v).__name__}")
            if k != "argument_hint" and not v.strip():
                raise CatalogError(f"{pfx} field '{k}' cannot be empty")
        src, name, path, cat = item["source"], item["name"], item["path"], item["category"]
        if not is_safe_posix_path(src) or not is_safe_posix_path(path):
            raise CatalogError(f"{pfx} unsafe or non-normalized relative path: {src!r} or {path!r}")
        if not name.startswith("/"):
            raise CatalogError(f"{pfx} command name must start with '/': {name!r}")
        try:
            command_segments_from_stem(name[1:])
        except ScanError as e:
            raise CatalogError(f"{pfx} {e}") from e
        if cat not in VALID_CMD_CATS:
            raise CatalogError(f"{pfx} invalid category: '{cat}'")
        if src in seen_src or name in seen_name or path in seen_path:
            raise CatalogError(f"{pfx} duplicate identity: src={src in seen_src}, name={name in seen_name}, path={path in seen_path}")
        seen_src.add(src)
        seen_name.add(name)
        seen_path.add(path)
        validated.append(dict(item))
    return validated


def validate_skill_records(records: Any) -> List[Dict[str, Any]]:
    if not isinstance(records, list):
        raise CatalogError(f"Skill data root must be a list, got {type(records).__name__}")
    validated, seen_src, seen_name, seen_path = [], set(), set(), set()
    for idx, item in enumerate(records):
        pfx = f"Skill record #{idx + 1}"
        if not isinstance(item, dict):
            raise CatalogError(f"{pfx} must be a mapping, got {type(item).__name__}")
        if tuple(item.keys()) != SKILL_KEYS:
            raise CatalogError(f"{pfx} exact keys must be {SKILL_KEYS}, got {tuple(item.keys())}")
        for k in ("source", "name", "path", "description", "category"):
            v = item[k]
            if not isinstance(v, str) or not v.strip():
                raise CatalogError(f"{pfx} field '{k}' must be non-empty string")
        for k in ("has_scripts", "has_references"):
            v = item[k]
            if not isinstance(v, bool) or type(v) is not bool:
                raise CatalogError(f"{pfx} field '{k}' must be boolean, got {type(v).__name__}")
        src, name, path, cat = item["source"], item["name"], item["path"], item["category"]
        if not is_safe_posix_path(src) or not is_safe_posix_path(path):
            raise CatalogError(f"{pfx} unsafe or non-normalized relative path: {src!r} or {path!r}")
        if "template-skill" in src or "template-skill" in name or "template-skill" in path:
            raise CatalogError(f"{pfx} template skill cannot be cataloged: {name}")
        if cat not in VALID_SKILL_CATS:
            raise CatalogError(f"{pfx} invalid category: '{cat}'")
        if src in seen_src or name in seen_name or path in seen_path:
            raise CatalogError(f"{pfx} duplicate identity: src={src in seen_src}, name={name in seen_name}, path={path in seen_path}")
        seen_src.add(src)
        seen_name.add(name)
        seen_path.add(path)
        validated.append(dict(item))
    return validated


def verify_freshness(committed: List[Dict[str, Any]], fresh: List[Dict[str, Any]], label: str = "records") -> None:
    if len(committed) != len(fresh):
        raise CatalogError(f"Freshness mismatch in {label}: committed has {len(committed)}, fresh scan found {len(fresh)}")
    for idx, (c, f) in enumerate(zip(sorted(committed, key=lambda x: x["name"]), sorted(fresh, key=lambda x: x["name"]))):
        if c != f:
            raise CatalogError(f"Freshness mismatch in {label} record #{idx + 1} ({c.get('name')})")


def load_yaml(filename: str, directory: Optional[Path] = None) -> Any:
    path = (directory or SCRIPT_DIR) / filename
    if not path.is_file():
        raise CatalogError(f"Required data file not found: {path}")
    try:
        content = path.read_text(encoding="utf-8")
    except OSError as e:
        raise CatalogError(f"Failed to read {path}: {e}") from e
    except UnicodeDecodeError as e:
        raise CatalogError(f"Invalid UTF-8 in {path}: {e}") from e
    try:
        return yaml.safe_load(content)
    except yaml.YAMLError as e:
        raise CatalogError(f"Malformed YAML in {path}: {e}") from e


def generate_commands_yaml(data_path: Optional[Path] = None) -> str:
    raw = load_yaml(data_path.name, directory=data_path.parent) if data_path else load_yaml("commands_data.yaml")
    commands = validate_command_records(raw)
    categories: Dict[str, List[Dict[str, Any]]] = {}
    for cmd in commands:
        entry = {k: v for k, v in cmd.items() if k != "source"}
        categories.setdefault(cmd["category"], []).append(entry)
    for cat in categories:
        categories[cat].sort(key=lambda x: x["name"])
    catalog = {
        "metadata": {
            "title": "Commands Catalog", "description": "Auto-generated catalog of all available commands in EVCrate",
            "last_updated": datetime.now().strftime("%Y-%m-%d"), "total_commands": len(commands),
        },
        "categories": CMD_CAT_LABELS, "commands": categories,
    }
    return yaml.dump(catalog, sort_keys=False, allow_unicode=True, default_flow_style=False)


def generate_skills_yaml(data_path: Optional[Path] = None) -> str:
    raw = load_yaml(data_path.name, directory=data_path.parent) if data_path else load_yaml("skills_data.yaml")
    skills = validate_skill_records(raw)
    categories: Dict[str, List[Dict[str, Any]]] = {}
    for s in skills:
        entry = {k: v for k, v in s.items() if k != "source"}
        categories.setdefault(s["category"], []).append(entry)
    for cat in categories:
        categories[cat].sort(key=lambda x: x["name"])
    catalog = {
        "metadata": {
            "title": "Skills Catalog", "description": "Auto-generated catalog of all available skills in EVCrate",
            "last_updated": datetime.now().strftime("%Y-%m-%d"), "total_skills": len(skills),
        },
        "categories": SKILL_CAT_LABELS,
        "legend": {"has_scripts": "📦 Has executable scripts", "has_references": "📚 Has reference documentation"},
        "skills": categories,
    }
    return yaml.dump(catalog, sort_keys=False, allow_unicode=True, default_flow_style=False)


def write_output(content: str, output_path: Optional[str] = None) -> None:
    if not output_path:
        print(content)
        return
    out = Path(output_path).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    temp = tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=str(out.parent), prefix=f".tmp-{out.name}-", delete=False)
    try:
        temp.write(content)
        temp.flush()
        os.fsync(temp.fileno())
        temp.close()
        os.replace(temp.name, str(out))
        print(f"✓ Generated {output_path}", file=sys.stderr)
    except Exception:
        if os.path.exists(temp.name):
            try:
                os.unlink(temp.name)
            except OSError:
                pass
        raise


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate command and skill catalogs", epilog="Outputs to stdout by default. Use --output to write to a file.")
    parser.add_argument("--skills", action="store_true", help="Generate only skills catalog")
    parser.add_argument("--commands", action="store_true", help="Generate only commands catalog")
    parser.add_argument("--output", "-o", metavar="PATH", help="Write output to file instead of stdout")
    parser.add_argument("--freshness", action="store_true", help="Verify freshness of data files against live scans")
    args = parser.parse_args()

    if args.freshness:
        try:
            from scan_commands import scan_commands
            from scan_skills import scan_skills
        except ImportError as e:
            raise CatalogError(f"Cannot import scanners for freshness check: {e}") from e
        verify_freshness(validate_command_records(load_yaml("commands_data.yaml")), scan_commands((SCRIPT_DIR.parent / "commands").resolve()), "commands")
        verify_freshness(validate_skill_records(load_yaml("skills_data.yaml")), scan_skills((SCRIPT_DIR.parent / "skills").resolve()), "skills")
        print("✓ All catalog data is fresh and matches authoritative scans", file=sys.stderr)
        return

    if args.output and not (args.skills ^ args.commands):
        raise CatalogError("--output requires exactly one of --skills or --commands")

    both_selected = (args.commands and args.skills) or not (args.skills or args.commands)
    cmd_out = generate_commands_yaml() if (args.commands or both_selected) else None
    skill_out = generate_skills_yaml() if (args.skills or both_selected) else None

    if cmd_out is not None:
        if both_selected:
            print("# === COMMANDS CATALOG ===")
        write_output(cmd_out, args.output if args.commands else None)
    if skill_out is not None:
        if both_selected:
            print("\n# === SKILLS CATALOG ===")
        write_output(skill_out, args.output if args.skills else None)
if __name__ == "__main__":
    try:
        main()
    except CatalogError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
