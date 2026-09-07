#!/usr/bin/env python3
"""Test suite for ev-help.py with scanner independence regressions."""

from pathlib import Path
import subprocess
import sys

GREEN = "\033[92m"
RED = "\033[91m"
RESET = "\033[0m"

SCRIPT_PATH = Path(__file__).parent / "ev-help.py"


def run_evcrate_help(*args):
    """Run ev-help.py with given arguments and return output."""
    res = subprocess.run([sys.executable, str(SCRIPT_PATH)] + list(args), capture_output=True, text=True)
    return res.stdout + res.stderr


def test_independence():
    """Verify ev-help.py does not import scanner modules or data files."""
    code = SCRIPT_PATH.read_text(encoding="utf-8")
    forbidden = ["scan_commands", "scan_skills", "commands_data", "skills_data", "import yaml"]
    for word in forbidden:
        if word in code:
            print(f"{RED}✗ FAIL independence: found '{word}' in ev-help.py{RESET}")
            return False
    print(f"{GREEN}✓ PASS independence: ev-help.py has no scanner or data imports{RESET}")
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
    tests = [test_independence()]

    print("\n--- Category Guides ---")
    tests.append(test_case("worktree category", ["worktree"], ["Git Worktrees", "Parallel Development", "/cmd-worktree", "isolated branch"]))
    tests.append(test_case("journal category", ["journal"], ["Technical Journaling", "/cmd-journal", "failures", "Lessons"]))
    tests.append(test_case("brainstorm category", ["brainstorm"], ["Brainstorming", "Ideation", "/cmd-brainstorm", "codingLevel"]))
    tests.append(test_case("watzup category", ["watzup"], ["Session Review", "Wrap-up", "/cmd-watzup", "summary"]))
    tests.append(test_case("plan category", ["plan"], ["Planning", "/cmd-plan__fast", "/cmd-plan__hard", "/cmd-plan__validate", "Commands:"]))
    tests.append(test_case("fix category", ["fix"], ["Fixing Issues", "/cmd-fix", "/cmd-debug"]))
    tests.append(test_case("cook category", ["cook"], ["Implementation", "/cmd-cook"]))

    print("\n--- Overview ---")
    tests.append(test_case("overview workflow sequences", [], ["Common Workflows:", "/cmd-plan", "/cmd-code", "/cmd-test", "/cmd-git__pr", "→"]))
    tests.append(test_case("overview tips", [], ["Tips:", "/cmd-brainstorm", "ultrathink", "tokens", "/preview", ":parallel", "quota"]))
    tests.append(test_case("overview categories", [], ["Categories:", "bootstrap", "cook", "fix", "plan", "test"]))

    print("\n--- Intent Detection & Routing ---")
    tests.append(test_case("multi-word routes to task", ["test", "my", "login"], ["Recommended for:"], ["# Testing"]))
    tests.append(test_case("single word category", ["test"], ["Testing", "Workflow:"]))
    tests.append(test_case("git matches git commands", ["git", "commit"], ["Recommended for:", "/cmd-git__cm"]))
    tests.append(test_case("word boundary check", ["digital", "marketing"], ["content", "Recommended for:"], ["/git"]))

    print("\n--- Command & Special Guides ---")
    tests.append(test_case("command with colon", ["plan:fast"], ["plan:fast"]))
    tests.append(test_case("config guide", ["config"], [".evcrate.json", "Configuration", "Resolution"]))
    tests.append(test_case("coding-level guide", ["coding-level"], ["Coding Level", "ELI5", "God Mode", "-1"]))
    tests.append(test_case("advise guide", ["advise"], ["Interview-first technical advice", "/cmd-advise"]))

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
