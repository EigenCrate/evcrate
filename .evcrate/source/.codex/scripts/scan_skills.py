#!/usr/bin/env python3
"""Scan skills directory and extract skill metadata."""

from dataclasses import dataclass
import os
from pathlib import Path
import re
import sys
import tempfile
from typing import Any, Dict, List, Optional, Set
import yaml

sys.dont_write_bytecode = True


class ScanError(Exception):
    """Raised when scanner validation or parsing fails."""
    pass


@dataclass(frozen=True)
class SkillLayout:
    root: Path
    output_path: Optional[Path] = None
    managed_entries: Optional[Set[str]] = None
    exclusions: Optional[Set[str]] = None
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


def extract_frontmatter(content: str, rel_path: str) -> Dict[str, Any]:
    match = re.match(r"^---\s*\n(.*?)\n---\s*\n", content, re.DOTALL)
    if not match:
        return {}
    try:
        data = yaml.safe_load(match.group(1))
    except Exception as e:
        raise ScanError(f"{rel_path}: malformed YAML frontmatter: {e}") from e
    if not isinstance(data, dict):
        raise ScanError(f"{rel_path}: frontmatter is not a mapping")
    return data


def extract_first_paragraph(content: str) -> str:
    content = re.sub(r"^---\s*\n.*?\n---\s*\n", "", content, flags=re.DOTALL)
    paragraph: List[str] = []
    for line in content.split("\n"):
        line = line.strip()
        if not line or line.startswith("#"):
            if paragraph:
                break
            continue
        paragraph.append(line)
        if len(" ".join(paragraph)) > 200:
            break
    return " ".join(paragraph)[:200]


def categorize_skill(name: str, description: str, content: str) -> str:
    lower = name.lower()
    if any(x in lower for x in ["ai-", "gemini", "multimodal", "adk"]):
        return "ai-ml"
    if any(x in lower for x in ["frontend", "ui", "design", "aesthetic", "threejs"]):
        return "frontend"
    if any(x in lower for x in ["backend", "auth", "payment"]):
        return "backend"
    if any(x in lower for x in ["devops", "docker", "cloudflare", "gcloud"]):
        return "infrastructure"
    if any(x in lower for x in ["database", "mongodb", "postgresql", "sql"]):
        return "database"
    if any(x in lower for x in ["mcp", "skill-creator", "codex-cli", "repomix", "docs-seeker"]):
        return "dev-tools"
    if any(x in lower for x in ["media", "chrome-devtools", "document-skills"]):
        return "multimedia"
    if any(x in lower for x in ["web-frameworks", "mobile", "shopify"]):
        return "frameworks"
    if any(x in lower for x in ["debug", "problem", "code-review", "planning", "research", "sequential"]):
        return "utilities"
    return "other"


def scan_skills(base_path: Optional[Path] = None, layout: Optional[SkillLayout] = None) -> List[Dict]:
    target_root = base_path if base_path is not None else (layout.root if layout else Path("."))
    root = Path(target_root).resolve()
    if not root.is_dir():
        raise ScanError(f"Root path not found: {root}")
    layout = layout or SkillLayout(root=root, exclusions={"template-skill", "template-skill/SKILL.md"})
    exclusions = set(layout.exclusions) if layout.exclusions is not None else set()

    if layout.managed_entries is not None:
        files = []
        for entry in sorted(layout.managed_entries):
            p = (root / entry).resolve()
            if not p.is_relative_to(root) or (root / entry).is_symlink() or not p.is_file():
                raise ScanError(f"Managed entry missing or unsafe: {entry}")
            if entry not in exclusions:
                files.append(root / entry)
    else:
        files = []
        for p in sorted(root.rglob("SKILL.md")):
            if p.is_symlink():
                raise ScanError(f"Symlink found in skill root: {p.relative_to(root).as_posix()}")
            if not p.is_file():
                continue
            rf, rd = p.relative_to(root).as_posix(), p.parent.relative_to(root).as_posix()
            if rf not in exclusions and rd not in exclusions and p.parent.name not in exclusions:
                files.append(p)

    skills, seen_names = [], set()
    for skill_file in files:
        posix_path = skill_file.relative_to(root).as_posix()
        skill_name = skill_file.parent.relative_to(root).as_posix()
        try:
            content = skill_file.read_text(encoding="utf-8")
        except UnicodeDecodeError as e:
            raise ScanError(f"{posix_path}: invalid UTF-8 encoding: {e}") from e
        except OSError as e:
            raise ScanError(f"{posix_path}: failed to read file: {e}") from e

        fm = extract_frontmatter(content, posix_path)
        desc = fm.get("description", "")
        if not desc or not isinstance(desc, str):
            desc = extract_first_paragraph(content)

        if skill_name in seen_names:
            raise ScanError(f"Duplicate skill name: {skill_name}")
        seen_names.add(skill_name)
        source = layout.source_map.get(posix_path, posix_path) if layout and layout.source_map else posix_path
        skills.append({
            "source": source, "name": skill_name, "path": posix_path, "description": desc,
            "category": categorize_skill(skill_name, desc, content),
            "has_scripts": (skill_file.parent / "scripts").is_dir(),
            "has_references": (skill_file.parent / "references").is_dir(),
        })

    skills.sort(key=lambda s: s["name"])
    return skills


def group_by_category(skills: List[Dict]) -> Dict[str, List[Dict]]:
    categories: Dict[str, List[Dict]] = {}
    for skill in skills:
        categories.setdefault(skill["category"], []).append(skill)
    return categories


def main() -> None:
    script_dir = Path(__file__).resolve().parent
    base_path = (script_dir.parent / "skills").resolve()
    output_path = script_dir / "skills_data.yaml"
    if not base_path.is_dir():
        print(f"Error: {base_path} not found", file=sys.stderr)
        sys.exit(1)
    print("Scanning skills...")
    try:
        skills = scan_skills(base_path)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    print(f"\nFound {len(skills)} skills\n")

    cat_names = {
        "ai-ml": "AI & Machine Learning", "frontend": "Frontend & Design",
        "backend": "Backend Development", "infrastructure": "Infrastructure & DevOps",
        "database": "Database & Storage", "dev-tools": "Development Tools",
        "multimedia": "Multimedia & Processing", "frameworks": "Frameworks & Platforms",
        "utilities": "Utilities & Helpers", "other": "Other",
    }
    for cat, items in sorted(group_by_category(skills).items()):
        print(f"\n{cat_names.get(cat, cat.upper())}:")
        for s in items:
            sf, rf = "📦" if s["has_scripts"] else "  ", "📚" if s["has_references"] else "  "
            print(f"  {sf}{rf} {s['name']:30} {s['description'][:80]}")
    try:
        atomic_write_yaml(output_path, skills)
        print(f"\n✓ Saved metadata to {output_path}")
    except Exception as e:
        print(f"Error saving metadata: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
