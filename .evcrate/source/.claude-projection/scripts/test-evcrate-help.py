#!/usr/bin/env python3
"""Behavior regressions for installed ev-help.py discovery and routing."""

import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
GREEN = "\033[92m"
RED = "\033[91m"
RESET = "\033[0m"

SCRIPT_PATH = Path(__file__).parent / "ev-help.py"


def run_evcrate_help(*args):
    """Run ev-help.py with given arguments and return output."""
    res = subprocess.run([sys.executable, str(SCRIPT_PATH)] + list(args), capture_output=True, text=True)
    return res.stdout + res.stderr


LEGACY_NAME_RE = re.compile(r"/evcrate[:-]|(?<![\w-])cmd[_-][a-z]|\bcmd_[a-z]|`/[a-z0-9-]+:[a-z0-9]")


def test_no_legacy_names():
    """Overview, every category and search output must only list /evc-cmd-* names."""
    ok = True
    for args in ([], ["plan"], ["fix"], ["git"], ["scout"], ["worktree"], ["advise"], ["logs"], ["debug", "login", "error"]):
        out = run_evcrate_help(*args)
        bad = LEGACY_NAME_RE.findall(out)
        if bad:
            ok = False
            print(f"{RED}✗ FAIL legacy names in output of {args}: {bad[:3]}{RESET}")
    if ok:
        print(f"{GREEN}✓ PASS no legacy command names in help output{RESET}")
    return ok


def test_flat_discovery_ignores_legacy_layout():
    """Flat evc-cmd-*.md files are discovered; nested dirs and non-evc-cmd files are ignored."""
    with tempfile.TemporaryDirectory() as td:
        claude = Path(td) / ".claude"
        (claude / "scripts").mkdir(parents=True)
        shutil.copy(SCRIPT_PATH, claude / "scripts" / "ev-help.py")
        cmds = claude / "commands"
        (cmds / "plan").mkdir(parents=True)
        (cmds / "evcrate").mkdir()
        for rel, desc in {
            "evc-cmd-plan-x-fast.md": "Fast plan",
            "evc-cmd-help.md": "Help me",
            "plan/fast.md": "Nested legacy",
            "evcrate/old.md": "Prefixed legacy",
            "plain.md": "No prefix",
        }.items():
            (cmds / rel).write_text(f"---\ndescription: {desc}\n---\nbody\n", encoding="utf-8")
        res = subprocess.run([sys.executable, str(claude / "scripts" / "ev-help.py")], capture_output=True, text=True)
        out = res.stdout
        ok = (
            "2 commands across 2 categories" in out
            and "`plan` (1)" in out and "`core` (1)" in out
            and not LEGACY_NAME_RE.search(out)
        )
        plan = subprocess.run([sys.executable, str(claude / "scripts" / "ev-help.py"), "plan"], capture_output=True, text=True).stdout
        ok = ok and "`/evc-cmd-plan-x-fast` - Fast plan" in plan and "Nested legacy" not in plan and "Prefixed legacy" not in plan
        if not ok:
            print(f"{RED}✗ FAIL flat discovery ignores legacy layout\n{out}{RESET}")
            return False
    print(f"{GREEN}✓ PASS flat discovery ignores nested/prefixed legacy files{RESET}")
    return True

def test_codex_skill_discovery_accepts_dollar_command_path():
    """Codex command skills retain a dollar invocation sigil."""
    with tempfile.TemporaryDirectory() as td:
        codex = Path(td) / ".codex"
        (codex / "scripts").mkdir(parents=True)
        shutil.copy(SCRIPT_PATH, codex / "scripts" / "ev-help.py")
        skill = Path(td) / ".agents" / "skills" / "evc-cmd-plan-x-fast" / "SKILL.md"
        skill.parent.mkdir(parents=True)
        skill.write_text(
            '---\nname: "evc-cmd-plan-x-fast"\ndescription: "Fast plan"\n---\n'
            '# evc-cmd-plan-x-fast\n\nCommand Path: $evc-cmd-plan-x-fast\n',
            encoding="utf-8",
        )
        clean_env = os.environ.copy()
        for name in ("CLAUDE_PROJECT_DIR", "CODEX_PROJECT_DIR", "GEMINI_PROJECT_DIR", "AGY_PROJECT_DIR"):
            clean_env.pop(name, None)
        out = subprocess.run(
            [sys.executable, str(codex / "scripts" / "ev-help.py"), "plan"],
            capture_output=True, text=True, cwd=td, env=clean_env,
        ).stdout
        if "`/evc-cmd-plan-x-fast` - Fast plan" not in out:
            print(f"{RED}✗ FAIL Codex dollar command-path discovery\n{out}{RESET}")
            return False
    print(f"{GREEN}✓ PASS Codex dollar command-path discovery{RESET}")
    return True


def test_installed_layout_from_foreign_cwd():
    """Installed layout, not caller cwd, owns discovery and command guidance."""
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        foreign = root / "foreign project"
        foreign.mkdir()
        (foreign / "commands").mkdir()
        (foreign / "commands" / "evc-cmd-foreign.md").write_text(
            '---\ndescription: Foreign command\n---\n', encoding="utf-8",
        )
        clean_env = os.environ.copy()
        for name in ("CLAUDE_PROJECT_DIR", "CODEX_PROJECT_DIR", "GEMINI_PROJECT_DIR", "AGY_PROJECT_DIR"):
            clean_env.pop(name, None)
        for target in ("claude", "codex", "antigravity", "pi", "omp", "copilot", "vscode"):
            installed = root / f"installed {target} 日本語"
            scripts = installed / "scripts"
            commands = installed / "native commands"
            scripts.mkdir(parents=True)
            commands.mkdir()
            shutil.copy(SCRIPT_PATH, scripts / "ev-help.py")
            (commands / "evc-cmd-advise.md").write_text(
                '---\ndescription: Interview\nargument-hint: "[prompt]"\n---\n',
                encoding="utf-8",
            )
            (scripts / "scanner-layout.json").write_text(json.dumps({
                "schema": "evcrate-scanner-layout-v1",
                "target": target,
                "commands": {"format": "markdown", "root": "../native commands",
                             "output": "commands_data.yaml"},
            }), encoding="utf-8")
            expected = "/evc:cmd-advise" if target == "vscode" else "/evc-cmd-advise"
            for args in (["core"], ["evc-cmd-advise"]):
                result = subprocess.run(
                    [sys.executable, str(scripts / "ev-help.py"), *args],
                    capture_output=True, text=True, cwd=foreign, env=clean_env,
                )
                if (result.returncode != 0 or expected not in result.stdout
                        or not result.stdout.startswith("@EVCRATE_OUTPUT_TYPE:")):
                    print(f"{RED}✗ FAIL installed layout from foreign cwd: {target}{RESET}")
                    return False
            (commands / "evc-cmd-advise.md").unlink()
            commands.rmdir()
            missing = subprocess.run(
                [sys.executable, str(scripts / "ev-help.py"), "evc-cmd-advise"],
                capture_output=True, text=True, cwd=foreign, env=clean_env,
            )
            if missing.returncode != 1 or missing.stdout.startswith("@EVCRATE_OUTPUT_TYPE:"):
                print(f"{RED}✗ FAIL missing installed command directory: {target}{RESET}")
                return False
    print(f"{GREEN}✓ PASS installed layout ownership and missing-resource failure{RESET}")
    return True


def test_case(name, args, expected, unexpected=None):
    """Run a test case and check for expected and unexpected patterns."""
    out = run_evcrate_help(*args) if args else run_evcrate_help()
    passed = True
    errors = []
    if not out.startswith("@EVCRATE_OUTPUT_TYPE:"):
        passed, errors = False, ["Missing @EVCRATE_OUTPUT_TYPE marker"]
    for p in expected:
        if p not in out:
            passed = False
            errors.append(f"Missing: '{p}'")
    forbidden = ["@DEVKIT_OUTPUT_TYPE", "devkit-help.py", "/devkit-help"]
    for p in [*(unexpected or []), *forbidden]:
        if p in out:
            passed = False
            errors.append(f"Unexpected: '{p}'")
    status = f"{GREEN}✓ PASS{RESET}" if passed else f"{RED}✗ FAIL{RESET}"
    print(f"{status} {name}")
    for err in errors:
        print(f"    \033[93m{err}{RESET}")
    return passed


def main():
    print("=" * 60 + "\nev-help.py Test Suite\n" + "=" * 60)
    tests = [test_no_legacy_names(), test_flat_discovery_ignores_legacy_layout(), test_codex_skill_discovery_accepts_dollar_command_path(), test_installed_layout_from_foreign_cwd()]

    print("\n--- Category Guides ---")
    tests.append(test_case("worktree category", ["worktree"], ["Git Worktrees", "Parallel Development", "/evc-cmd-worktree", "isolated branch"]))
    tests.append(test_case("journal category", ["journal"], ["Technical Journaling", "/evc-cmd-journal", "failures", "Lessons"]))
    tests.append(test_case("brainstorm category", ["brainstorm"], ["Brainstorming", "Ideation", "/evc-cmd-brainstorm", "codingLevel"]))
    tests.append(test_case("watzup category", ["watzup"], ["Session Review", "Wrap-up", "/evc-cmd-watzup", "summary"]))
    tests.append(test_case("plan category", ["plan"], ["Planning", "/evc-cmd-plan-x-fast", "/evc-cmd-plan-x-hard", "/evc-cmd-plan-x-validate", "Commands:"]))
    tests.append(test_case("fix category", ["fix"], ["Fixing Issues", "/evc-cmd-fix", "/evc-cmd-debug", "/evc-cmd-fix-x-hard"]))
    tests.append(test_case("cook category", ["cook"], ["Implementation", "/evc-cmd-cook", "/evc-cmd-cook-x-auto"]))

    print("\n--- Overview ---")
    tests.append(test_case("overview workflow sequences", [], ["Common Workflows:", "/evc-cmd-plan", "/evc-cmd-code", "/evc-cmd-test", "/evc-cmd-git-x-pr", "→", "/evc-cmd-help"]))
    tests.append(test_case("overview tips", [], ["Tips:", "/evc-cmd-brainstorm", "ultrathink", "tokens", "-x-parallel", "quota"]))
    tests.append(test_case("overview categories", [], ["Categories:", "bootstrap", "cook", "fix", "plan", "test"]))

    print("\n--- Intent Detection & Routing ---")
    tests.append(test_case("multi-word routes to task", ["test", "my", "login"], ["Recommended for:"], ["# Testing"]))
    tests.append(test_case("single word category", ["test"], ["Testing", "Workflow:"]))
    tests.append(test_case("git matches git commands", ["git", "commit"], ["Recommended for:", "/evc-cmd-git-x-cm"]))
    tests.append(test_case("word boundary check", ["digital", "marketing"], ["content", "Recommended for:"], ["/git"]))

    print("\n--- Command & Special Guides ---")
    tests.append(test_case("command with colon", ["plan:fast"], ["# `/evc-cmd-plan-x-fast`", "**Category:** plan"]))
    tests.append(test_case("command with leading slash and colon", ["/plan:hard"], ["# `/evc-cmd-plan-x-hard`", "**Related:**"]))
    tests.append(test_case("space-separated words stay a task description", ["fix", "test"], ["Recommended for:"], ["# `/evc-cmd-fix-x-test`"]))
    tests.append(test_case("flat name with free text stays a task description", ["/evc-cmd-plan-x-hard", "improve", "login"], ["Recommended for:"], ["# `/evc-cmd-plan-x-hard`", "not found"]))
    tests.append(test_case("bare flat name with free text stays a task description", ["evc-cmd-plan-x-hard", "improve", "login"], ["Recommended for:"], ["# `/evc-cmd-plan-x-hard`", "not found"]))
    tests.append(test_case("command by flat name", ["/evc-cmd-plan-x-hard"], ["# `/evc-cmd-plan-x-hard`", "**Category:** plan"]))
    tests.append(test_case("deep flat name", ["evc-cmd-bootstrap-x-auto-x-fast"], ["# `/evc-cmd-bootstrap-x-auto-x-fast`", "**Category:** bootstrap"]))
    tests.append(test_case("core command by flat name", ["/evc-cmd-help"], ["# `/evc-cmd-help`", "**Category:** core"]))
    tests.append(test_case("search by keyword", ["logs"], ["# Search: logs", "/evc-cmd-fix-x-logs"], ["/evcrate:"]))
    tests.append(test_case("search matches semantic id", ["plan:ha"], ["# Search:", "/evc-cmd-plan-x-hard"], ["/plan:"]))
    tests.append(test_case("config guide", ["config"], [".evcrate.json", "Configuration", "Resolution"]))
    tests.append(test_case("coding-level guide", ["coding-level"], ["Coding Level", "ELI5", "God Mode", "-1"]))
    tests.append(test_case("advise guide", ["advise"], ["/evc-cmd-advise"]))

    print("\n" + "=" * 60)
    passed, total = sum(tests), len(tests)
    if passed == total:
        print(f"{GREEN}All {total} tests passed!{RESET}")
        sys.exit(0)
    else:
        print(f"{RED}{total - passed} of {total} tests failed{RESET}")
        sys.exit(1)


if __name__ == "__main__":
    main()
