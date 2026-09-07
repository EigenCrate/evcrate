#!/usr/bin/env python3
"""Comprehensive regressions for scan_commands.py and scan_skills.py."""

import os
from pathlib import Path
import subprocess
import sys
import tempfile
import yaml

sys.dont_write_bytecode = True
from scan_commands import CommandLayout, ScanError, atomic_write_yaml, scan_commands
from scan_skills import SkillLayout, scan_skills
from generate_catalogs import (
    CatalogError, validate_command_records, validate_skill_records,
    verify_freshness, generate_commands_yaml, generate_skills_yaml,
)

GREEN = "\033[92m"
RED = "\033[91m"
RESET = "\033[0m"


def test_canonical():
    script_dir = Path(__file__).resolve().parent
    root_cmd = script_dir.parent / "commands"
    root_skill = script_dir.parent / "skills"

    cmds = scan_commands(root_cmd)
    assert len(cmds) == 70, f"Expected 70 canonical commands, got {len(cmds)}"
    for c in cmds:
        assert c["name"].startswith("/evcrate:"), f"Invalid name: {c['name']}"
        assert c["path"].endswith(".md"), f"Invalid path: {c['path']}"
        assert c["source"].endswith(".md"), f"Invalid source: {c['source']}"
        assert isinstance(c["description"], str) and c["description"], f"Bad desc in {c}"
        assert isinstance(c["argument_hint"], str), f"Bad hint in {c}"
        assert isinstance(c["category"], str) and c["category"], f"Bad category in {c}"
    skills = scan_skills(root_skill)
    assert len(skills) == 36, f"Expected 36 skills (excluding template), got {len(skills)}"
    names = {s["name"] for s in skills}
    assert "template-skill" not in names, "template-skill should be excluded"
    assert "document-skills/docx" in names, "nested skill document-skills/docx missing"
    for s in skills:
        assert s["path"].endswith("SKILL.md"), f"Invalid skill path: {s['path']}"
        assert s["source"].endswith("SKILL.md"), f"Invalid source: {s['source']}"
        assert isinstance(s["description"], str) and s["description"], f"Bad desc in {s}"
    print(f"{GREEN}✓ PASS canonical scans (70 commands, 36 skills){RESET}")


def test_three_formats_and_nesting():
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        # Markdown
        md_root = root / "md"
        md_file = md_root / "sub1" / "sub2" / "deep.md"
        md_file.parent.mkdir(parents=True)
        md_file.write_text('---\ndescription: "Deep Markdown 日本語"\nargument-hint: "[opt]"\n---\nBody', encoding="utf-8")
        res_md = scan_commands(md_root, CommandLayout(root=md_root, format="markdown"))
        assert len(res_md) == 1 and res_md[0]["name"] == "/evcrate:sub1:sub2:deep"
        assert res_md[0]["description"] == "Deep Markdown 日本語" and res_md[0]["path"] == "sub1/sub2/deep.md"

        # TOML
        toml_root = root / "toml"
        toml_root.mkdir()
        toml_file = toml_root / "tool.toml"
        toml_file.write_text('description = "Tool Command Café"\nargument_hint = "<req>"\n', encoding="utf-8")
        res_toml = scan_commands(toml_root, CommandLayout(root=toml_root, format="toml"))
        assert len(res_toml) == 1 and res_toml[0]["description"] == "Tool Command Café"

        # Command-skill
        cs_root = root / "skills"
        cs_file = cs_root / "cmd-test" / "SKILL.md"
        cs_file.parent.mkdir(parents=True)
        cs_file.write_text('---\nname: "evcrate-cmd-test"\ndescription: "Skill Cmd"\nargument-hint: ""\n---\nBody', encoding="utf-8")
        res_cs = scan_commands(cs_root, CommandLayout(root=cs_root, format="command-skill"))
        assert len(res_cs) == 1 and res_cs[0]["name"] == "/evcrate-cmd-test"
    print(f"{GREEN}✓ PASS three formats, unicode, and deep nesting{RESET}")


def test_managed_entries_and_unrelated_files():
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        (root / "managed.md").write_text('---\ndescription: "Managed"\nargument-hint: ""\n---\n', encoding="utf-8")
        (root / "unrelated.md").write_text('---\ndescription: "Unrelated"\nargument-hint: ""\n---\n', encoding="utf-8")
        layout = CommandLayout(root=root, format="markdown", managed_entries={"managed.md"})
        res = scan_commands(root, layout)
        assert len(res) == 1 and res[0]["name"] == "/evcrate:managed"

        (root / "skills" / "managed-skill").mkdir(parents=True)
        (root / "skills" / "managed-skill" / "SKILL.md").write_text('---\ndescription: "Skill A"\n---\n', encoding="utf-8")
        (root / "skills" / "unrelated-skill").mkdir(parents=True)
        (root / "skills" / "unrelated-skill" / "SKILL.md").write_text('---\ndescription: "Skill B"\n---\n', encoding="utf-8")
        s_layout = SkillLayout(root=root / "skills", managed_entries={"managed-skill/SKILL.md"})
        s_res = scan_skills(root / "skills", s_layout)
        assert len(s_res) == 1 and s_res[0]["name"] == "managed-skill"
    print(f"{GREEN}✓ PASS managed allowlist ignores unrelated files{RESET}")


def test_fail_closed_and_sentinel():
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        out_file = root / "output.yaml"
        out_file.write_text("sentinel: original\n", encoding="utf-8")

        # Missing allowlisted file
        layout = CommandLayout(root=root, format="markdown", managed_entries={"nonexistent.md"})
        try:
            scan_commands(root, layout)
            assert False, "Should fail on missing allowlisted file"
        except ScanError:
            pass

        # Malformed YAML
        bad_md = root / "bad.md"
        bad_md.write_text("---\ndescription: [unclosed\n---\n", encoding="utf-8")
        try:
            scan_commands(root, CommandLayout(root=root, format="markdown"))
            assert False, "Should fail on malformed YAML"
        except ScanError:
            pass
        bad_md.unlink()

        # Missing description
        no_desc = root / "nodesc.md"
        no_desc.write_text('---\nargument-hint: ""\n---\n', encoding="utf-8")
        try:
            scan_commands(root, CommandLayout(root=root, format="markdown"))
            assert False, "Should fail on missing description"
        except ScanError:
            pass
        no_desc.unlink()

        # Wrong type for argument-hint
        wrong_hint = root / "wronghint.md"
        wrong_hint.write_text('---\ndescription: "ok"\nargument-hint: 123\n---\n', encoding="utf-8")
        try:
            scan_commands(root, CommandLayout(root=root, format="markdown"))
            assert False, "Should fail on non-string hint"
        except ScanError:
            pass
        wrong_hint.unlink()

        # Malformed TOML
        bad_toml = root / "bad.toml"
        bad_toml.write_text("description = unquoted\n", encoding="utf-8")
        try:
            scan_commands(root, CommandLayout(root=root, format="toml"))
            assert False, "Should fail on malformed TOML"
        except ScanError:
            pass
        bad_toml.unlink()

        # Sentinel verification: out_file remains byte-identical
        assert out_file.read_text(encoding="utf-8") == "sentinel: original\n"
    print(f"{GREEN}✓ PASS fail-closed validations and sentinel preservation{RESET}")


def test_cwd_independence():
    script_dir = Path(__file__).resolve().parent
    cmd_script = script_dir / "scan_commands.py"
    skill_script = script_dir / "scan_skills.py"

    for run_cwd in [script_dir, script_dir.parent.parent.parent, Path(tempfile.gettempdir())]:
        p1 = subprocess.run([sys.executable, str(cmd_script)], cwd=run_cwd, capture_output=True, text=True)
        assert p1.returncode == 0, f"Failed scan_commands from {run_cwd}: {p1.stderr}"
        p2 = subprocess.run([sys.executable, str(skill_script)], cwd=run_cwd, capture_output=True, text=True)
        assert p2.returncode == 0, f"Failed scan_skills from {run_cwd}: {p2.stderr}"
    print(f"{GREEN}✓ PASS CWD independence (repo root, script dir, and /tmp){RESET}")
def test_catalog_schema_validation():
    valid_cmd = [{
        "source": "advise.md", "name": "/cmd-advise", "path": "advise.md",
        "description": "Advice", "argument_hint": "", "category": "core",
    }]
    assert len(validate_command_records(valid_cmd)) == 1

    try:
        validate_command_records([{"name": "/cmd-advise", "path": "advise.md", "description": "d", "argument_hint": "", "category": "core"}])
        assert False, "Should reject missing 'source'"
    except CatalogError:
        pass

    try:
        validate_command_records([{**valid_cmd[0], "power_level": 1}])
        assert False, "Should reject extra key 'power_level'"
    except CatalogError:
        pass

    try:
        validate_command_records({"not": "a list"})
        assert False, "Should reject non-list root"
    except CatalogError:
        pass

    try:
        validate_command_records([{**valid_cmd[0], "path": "../outside.md"}])
        assert False, "Should reject traversal path"
    except CatalogError:
        pass
    try:
        validate_command_records([{**valid_cmd[0], "path": "path\0poison.md"}])
        assert False, "Should reject null byte in path"
    except CatalogError:
        pass


    try:
        validate_command_records([valid_cmd[0], valid_cmd[0]])
        assert False, "Should reject duplicate command"
    except CatalogError:
        pass

    valid_skill = [{
        "source": "demo/SKILL.md", "name": "demo", "path": "demo/SKILL.md",
        "description": "Demo skill", "category": "utilities", "has_scripts": False, "has_references": True,
    }]
    assert len(validate_skill_records(valid_skill)) == 1

    try:
        validate_skill_records([{**valid_skill[0], "name": "template-skill"}])
        assert False, "Should reject template skill"
    except CatalogError:
        pass

    try:
        validate_skill_records([{**valid_skill[0], "has_scripts": "not_bool"}])
        assert False, "Should reject string for boolean field"
    except CatalogError:
        pass

    print(f"{GREEN}✓ PASS catalog schema validation & error cases{RESET}")


def test_catalog_freshness_and_generator():
    script_dir = Path(__file__).resolve().parent
    gen_script = script_dir / "generate_catalogs.py"

    res = subprocess.run([sys.executable, str(gen_script), "--freshness"], cwd=script_dir, capture_output=True, text=True)
    assert res.returncode == 0, f"Freshness check failed: {res.stderr}"
    assert "fresh" in res.stderr.lower()

    rec_a = [{"source": "a.md", "name": "/a", "path": "a.md", "description": "a", "argument_hint": "", "category": "core"}]
    rec_b = [{"source": "b.md", "name": "/b", "path": "b.md", "description": "b", "argument_hint": "", "category": "core"}]
    try:
        verify_freshness(rec_a, rec_b, "test")
        assert False, "Should raise CatalogError on mismatched records"
    except CatalogError:
        pass

    with tempfile.TemporaryDirectory() as td:
        tmp_dir = Path(td)
        cmd_out = tmp_dir / "commands.yaml"
        skill_out = tmp_dir / "skills.yaml"

        res_cmd = subprocess.run([sys.executable, str(gen_script), "--commands", "--output", str(cmd_out)], capture_output=True, text=True)
        assert res_cmd.returncode == 0, f"Command catalog generation failed: {res_cmd.stderr}"
        assert cmd_out.is_file()
        cmd_catalog = yaml.safe_load(cmd_out.read_text(encoding="utf-8"))
        assert cmd_catalog["metadata"]["total_commands"] == 70
        assert "commands" in cmd_catalog and "categories" in cmd_catalog

        res_skill = subprocess.run([sys.executable, str(gen_script), "--skills", "--output", str(skill_out)], capture_output=True, text=True)
        assert res_skill.returncode == 0, f"Skill catalog generation failed: {res_skill.stderr}"
        assert skill_out.is_file()
        skill_catalog = yaml.safe_load(skill_out.read_text(encoding="utf-8"))
        assert skill_catalog["metadata"]["total_skills"] == 36
        assert "skills" in skill_catalog and "legend" in skill_catalog

        bad_out = tmp_dir / "sentinel.yaml"
        bad_out.write_text("sentinel\n", encoding="utf-8")
        res_bad = subprocess.run([sys.executable, str(gen_script), "--output", str(bad_out)], capture_output=True, text=True)
        assert res_bad.returncode == 1
        assert bad_out.read_text(encoding="utf-8") == "sentinel\n"

    print(f"{GREEN}✓ PASS catalog freshness, generation, and atomic write{RESET}")


def main():
    print("=" * 60 + "\nCatalog Scanners Test Suite\n" + "=" * 60)
    test_canonical()
    test_three_formats_and_nesting()
    test_managed_entries_and_unrelated_files()
    test_fail_closed_and_sentinel()
    test_cwd_independence()
    test_catalog_schema_validation()
    test_catalog_freshness_and_generator()
    print("=" * 60 + f"\n{GREEN}All catalog regression tests passed!{RESET}\n")

if __name__ == "__main__":
    main()
