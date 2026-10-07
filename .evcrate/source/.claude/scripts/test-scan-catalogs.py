#!/usr/bin/env python3
"""Comprehensive regressions for scan_commands.py and scan_skills.py."""

import os
from pathlib import Path
import subprocess
import sys
import tempfile
import yaml

sys.dont_write_bytecode = True
from scan_commands import (
    CommandLayout, ScanError, atomic_write_yaml, command_segments_from_stem, command_semantic_name,
    resolve_command_layout, scan_commands,
)
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
        assert c["name"].startswith("/evc-cmd-"), f"Invalid name: {c['name']}"
        assert c["path"] == c["source"] == c["name"][1:] + ".md", f"Name/path mismatch: {c}"
        assert "/" not in c["path"], f"Nested path: {c['path']}"
        expected_cat = c["name"][len("/evc-cmd-"):].split("-x-")
        assert c["category"] == (expected_cat[0] if len(expected_cat) > 1 else "core"), f"Bad category: {c}"
        assert "evcrate:" not in c["name"], f"Legacy name: {c['name']}"
        assert c["source"].endswith(".md"), f"Invalid source: {c['source']}"
        assert isinstance(c["description"], str) and c["description"], f"Bad desc in {c}"
        assert isinstance(c["argument_hint"], str), f"Bad hint in {c}"
        assert isinstance(c["category"], str) and c["category"], f"Bad category in {c}"
    skills = scan_skills(root_skill)
    assert len(skills) == 38, f"Expected 38 skills (excluding template), got {len(skills)}"
    names = {s["name"] for s in skills}
    assert "template-skill" not in names, "template-skill should be excluded"
    assert "document-skills/docx" in names, "nested skill document-skills/docx missing"
    for s in skills:
        assert s["path"].endswith("SKILL.md"), f"Invalid skill path: {s['path']}"
        assert s["source"].endswith("SKILL.md"), f"Invalid source: {s['source']}"
        assert isinstance(s["description"], str) and s["description"], f"Bad desc in {s}"
    print(f"{GREEN}✓ PASS canonical scans (70 commands, 38 skills){RESET}")


def test_three_formats_and_flat_names():
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        # Markdown: flat stem, -x- separated segments
        md_root = root / "md"
        md_file = md_root / "evc-cmd-sub1-x-deep-name.md"
        md_file.parent.mkdir(parents=True)
        md_file.write_text('---\ndescription: "Deep Markdown 日本語"\nargument-hint: "[opt]"\n---\nBody', encoding="utf-8")
        res_md = scan_commands(md_root, CommandLayout(root=md_root, format="markdown"))
        assert len(res_md) == 1 and res_md[0]["name"] == "/evc-cmd-sub1-x-deep-name" and res_md[0]["category"] == "sub1"
        assert res_md[0]["description"] == "Deep Markdown 日本語" and res_md[0]["path"] == "evc-cmd-sub1-x-deep-name.md"

        # Root command (single segment) is core
        (md_root / "evc-cmd-root.md").write_text('---\ndescription: "Root"\nargument-hint: ""\n---\n', encoding="utf-8")
        res_root = {c["name"]: c for c in scan_commands(md_root, CommandLayout(root=md_root, format="markdown"))}
        assert res_root["/evc-cmd-root"]["category"] == "core"

        # TOML
        toml_root = root / "toml"
        toml_root.mkdir()
        toml_file = toml_root / "evc-cmd-tool.toml"
        toml_file.write_text('description = "Tool Command Café"\nargument_hint = "<req>"\n', encoding="utf-8")
        res_toml = scan_commands(toml_root, CommandLayout(root=toml_root, format="toml"))
        assert len(res_toml) == 1 and res_toml[0]["description"] == "Tool Command Café" and res_toml[0]["name"] == "/evc-cmd-tool"

        # Command-skill
        cs_root = root / "skills"
        cs_file = cs_root / "evc-cmd-test" / "SKILL.md"
        cs_file.parent.mkdir(parents=True)
        cs_file.write_text('---\nname: "evc-cmd-test"\ndescription: "Skill Cmd"\nargument-hint: ""\n---\nBody', encoding="utf-8")
        res_cs = scan_commands(cs_root, CommandLayout(root=cs_root, format="command-skill"))
        assert len(res_cs) == 1 and res_cs[0]["name"] == "/evc-cmd-test"
    print(f"{GREEN}✓ PASS three formats, unicode, and flat -x- names{RESET}")


def test_flat_name_rules_and_rejections():
    assert command_segments_from_stem("evc-cmd-a-x-b-x-c") == ["a", "b", "c"]
    assert command_segments_from_stem("evc-cmd-use-mcp") == ["use-mcp"]
    assert command_semantic_name("evc-cmd-plan-x-hard.md") == "plan:hard"
    assert command_semantic_name("evc-cmd-help.md") == "help"
    for bad in ("plan", "cmd-plan", "cmd_plan", "evcrate-plan", "evc-cmd-", "evc-cmd--x-a", "evc-cmd-a-x-", "evc-cmd-a-x-x-b",
                "evc-cmd-A", "evc-cmd-a__b", "evc-cmd-a:b", "plan/hard", "evc-cmd-plan/hard", "evc-cmd-plan\\hard"):
        try:
            command_segments_from_stem(bad)
            assert False, f"Should reject stem: {bad!r}"
        except ScanError:
            pass
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        (root / "plan").mkdir()
        (root / "plan" / "evc-cmd-plan-x-hard.md").write_text('---\ndescription: "Nested"\nargument-hint: ""\n---\n', encoding="utf-8")
        try:
            scan_commands(root, CommandLayout(root=root, format="markdown"))
            assert False, "Should reject nested command file"
        except ScanError:
            pass
        (root / "plan" / "evc-cmd-plan-x-hard.md").unlink()
        (root / "plan").rmdir()
        (root / "plan.md").write_text('---\ndescription: "Unprefixed"\nargument-hint: ""\n---\n', encoding="utf-8")
        try:
            scan_commands(root, CommandLayout(root=root, format="markdown"))
            assert False, "Should reject command file without evc-cmd- prefix"
        except ScanError:
            pass
    # command-skill layout validates the frontmatter name with the same flat-name contract
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        skill = root / "evc-cmd-plan-x-hard"
        skill.mkdir()
        (skill / "SKILL.md").write_text('---\nname: evc-cmd-plan-x-hard\ndescription: "D"\nargument-hint: ""\n---\n', encoding="utf-8")
        res = scan_commands(root, CommandLayout(root=root, format="command-skill"))
        assert [(c["name"], c["category"]) for c in res] == [("/evc-cmd-plan-x-hard", "plan")], res
        for bad_name in ("plan", "cmd_plan_hard", "evc-cmd-plan-x-"):
            (skill / "SKILL.md").write_text(f'---\nname: {bad_name}\ndescription: "D"\nargument-hint: ""\n---\n', encoding="utf-8")
            try:
                scan_commands(root, CommandLayout(root=root, format="command-skill"))
                assert False, f"Should reject command-skill name {bad_name!r}"
            except ScanError:
                pass
    # catalog records reuse the scanner contract
    record = {"source": "evc-cmd-plan.md", "name": "/evc-cmd-plan", "path": "evc-cmd-plan.md", "description": "D", "argument_hint": "", "category": "core"}
    validate_command_records([record])
    for bad_name in ("/plan", "/evcrate:plan", "/cmd_plan", "/evc-cmd-plan:hard"):
        try:
            validate_command_records([{**record, "name": bad_name}])
            assert False, f"Should reject catalog name {bad_name!r}"
        except CatalogError:
            pass
    print(f"{GREEN}✓ PASS flat name derivation and legacy-form rejection{RESET}")


def test_authority_layouts_derive_flat_names():
    with tempfile.TemporaryDirectory() as td:
        sd = Path(td) / "scripts"
        sd.mkdir()
        root = Path(td) / "commands"
        root.mkdir()
        for stem in ("evc-cmd-plan-x-hard", "evc-cmd-help"):
            (root / f"{stem}.md").write_text('---\ndescription: "D"\nargument-hint: ""\n---\n', encoding="utf-8")

        def layout_for(auth_name, auth_payload, target="gemini", fmt="markdown"):
            auth = sd / auth_name
            auth.write_text(auth_payload if isinstance(auth_payload, str) else __import__("json").dumps(auth_payload), encoding="utf-8")
            (sd / "scanner-layout.json").write_text(__import__("json").dumps({
                "schema": "evcrate-scanner-layout-v1", "target": target,
                "commands": {"format": fmt, "root": "../commands", "output": "out.yaml", "authority": auth_name},
            }), encoding="utf-8")
            return resolve_command_layout(sd)

        # YAML authority: sourceName is the semantic colon form, name wins from the record
        lay = layout_for("auth.yaml", yaml.safe_dump([
            {"source": "evc-cmd-plan-x-hard.md", "name": "/evc-cmd-plan-x-hard"},
            {"source": "evc-cmd-help.md", "name": "/evc-cmd-help"},
        ]))
        assert lay.name_map["evc-cmd-plan-x-hard.md"]["sourceName"] == "plan:hard"
        got = {c["name"]: c["category"] for c in scan_commands(layout=lay)}
        assert got == {"/evc-cmd-plan-x-hard": "plan", "/evc-cmd-help": "core"}, got

        # commands-list authority: targetName falls back to the flat stem
        lay = layout_for("auth.json", {"commands": ["evc-cmd-plan-x-hard", "evc-cmd-help.md"]})
        assert lay.name_map["evc-cmd-plan-x-hard.md"] == {"source": "evc-cmd-plan-x-hard.md", "targetName": "evc-cmd-plan-x-hard", "sourceName": "plan:hard"}
        assert lay.name_map["evc-cmd-help.md"]["targetName"] == "evc-cmd-help"

        # behaviors authority (all targets): fallback targetName is the flat stem, explicit target_name wins
        behaviors = {"behaviors": [
            {"kind": "command-prose", "status": "migrated", "source": "evc-cmd-plan-x-hard.md", "target": "evc-cmd-plan-x-hard.md"},
            {"kind": "command-prose", "status": "migrated", "source": "evc-cmd-help.md", "target": "evc-cmd-help.md", "target_name": "custom-help"},
        ]}
        for target in ("gemini", "codex", "antigravity", "claude"):
            lay = layout_for("auth.json", behaviors, target=target)
            assert lay.name_map["evc-cmd-plan-x-hard.md"]["targetName"] == "evc-cmd-plan-x-hard", target
            assert lay.name_map["evc-cmd-plan-x-hard.md"]["sourceName"] == "plan:hard", target
            assert lay.name_map["evc-cmd-help.md"]["targetName"] == "custom-help", target

        # command-map schema: explicit targetName wins, sourceName derived from flat source
        lay = layout_for("auth.json", {"schema": "evcrate-omp-command-map-v1", "commands": [
            {"source": "evc-cmd-plan-x-hard.md", "target": "evc-cmd-plan-x-hard.md", "targetName": "evc-cmd-plan-x-hard"},
        ]})
        assert lay.name_map["evc-cmd-plan-x-hard.md"]["sourceName"] == "plan:hard"
        res = scan_commands(layout=lay)
        assert [(c["name"], c["category"]) for c in res] == [("/evc-cmd-plan-x-hard", "plan")], res

        # Nested / legacy sources in any authority are rejected
        for payload in (
            {"commands": ["plan/hard"]},
            {"commands": ["cmd_plan_hard"]},
            {"behaviors": [{"kind": "command-prose", "status": "migrated", "source": "plan/hard.md", "target": "plan/hard.md"}]},
            {"schema": "evcrate-omp-command-map-v1", "commands": [{"source": "plan/hard.md", "target": "x.md", "targetName": "x"}]},
            yaml.safe_dump([{"source": "plan.md", "name": "/evc-cmd-plan"}]),
            yaml.safe_dump([{"source": "evc-cmd-plan-x-hard.md", "name": "/plan:hard"}]),
            yaml.safe_dump([{"source": 7, "name": "/evc-cmd-plan"}]),
        ):
            try:
                layout_for("auth.yaml" if isinstance(payload, str) else "auth.json", payload)
                assert False, f"Should reject legacy/nested authority source: {payload}"
            except ScanError:
                pass
    print(f"{GREEN}✓ PASS authority layouts derive semantic names and flat target fallbacks{RESET}")


def test_managed_entries_and_unrelated_files():
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        (root / "evc-cmd-managed.md").write_text('---\ndescription: "Managed"\nargument-hint: ""\n---\n', encoding="utf-8")
        (root / "evc-cmd-unrelated.md").write_text('---\ndescription: "Unrelated"\nargument-hint: ""\n---\n', encoding="utf-8")
        layout = CommandLayout(root=root, format="markdown", managed_entries={"evc-cmd-managed.md"})
        res = scan_commands(root, layout)
        assert len(res) == 1 and res[0]["name"] == "/evc-cmd-managed"

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
        "source": "evc-cmd-advise.md", "name": "/evc-cmd-advise", "path": "evc-cmd-advise.md",
        "description": "Advice", "argument_hint": "", "category": "core",
    }]
    assert len(validate_command_records(valid_cmd)) == 1

    try:
        validate_command_records([{"name": "/evc-cmd-advise", "path": "evc-cmd-advise.md", "description": "d", "argument_hint": "", "category": "core"}])
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
        assert skill_catalog["metadata"]["total_skills"] == 38
        assert "skills" in skill_catalog and "legend" in skill_catalog

        bad_out = tmp_dir / "sentinel.yaml"
        bad_out.write_text("sentinel\n", encoding="utf-8")
        res_bad = subprocess.run([sys.executable, str(gen_script), "--output", str(bad_out)], capture_output=True, text=True)
        assert res_bad.returncode == 1
        assert bad_out.read_text(encoding="utf-8") == "sentinel\n"

    print(f"{GREEN}✓ PASS catalog freshness, generation, and atomic write{RESET}")


def main():
    print("=" * 60 + "\nCatalog Scanners Test Suite\n" + "=" * 60)
    tests = [
        test_canonical,
        test_three_formats_and_flat_names,
        test_flat_name_rules_and_rejections,
        test_authority_layouts_derive_flat_names,
        test_managed_entries_and_unrelated_files,
        test_fail_closed_and_sentinel,
        test_cwd_independence,
        test_catalog_schema_validation,
        test_catalog_freshness_and_generator,
    ]
    # Run every test so one failing inventory assertion cannot hide the rest.
    failures = []
    for test in tests:
        try:
            test()
        except Exception as error:  # noqa: BLE001 - report and continue
            failures.append(test.__name__)
            print(f"{RED}✗ FAIL {test.__name__}: {type(error).__name__}: {error}{RESET}")
    if failures:
        print("=" * 60 + f"\n{RED}{len(failures)}/{len(tests)} tests failed: {', '.join(failures)}{RESET}\n")
        sys.exit(1)
    print("=" * 60 + f"\n{GREEN}All catalog regression tests passed!{RESET}\n")

if __name__ == "__main__":
    main()
