#!/usr/bin/env python3
"""
Interactive Linux console verification for N15 human-decision gate.
Runs against real installed controller using Node and actual OS pseudo-terminal (/dev/tty).
Exercises:
  1. Wrong/replayed nonce refuses with HUMAN_EVENT_REQUIRED
  2. Current exact challenge accepts with source: local-terminal-confirmation
  3. Abort cancels
"""

import os
import pty
import sys
import json
import time
import uuid
import signal
import subprocess
import tempfile
import shutil

PACKAGE_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
NODE_PATH = shutil.which("node") or "node"

def run_controller_state(controller, home, project, operation, task_run_id, expected_rev, payload):
    req = {
        "protocol": "evcrate-advisor-state",
        "version": 1,
        "operation": operation,
        "task_run_id": task_run_id,
        "operation_id": str(uuid.uuid4()),
        "expected_revision": expected_rev,
        "payload": payload
    }
    env = os.environ.copy()
    env["HOME"] = home
    env["USERPROFILE"] = home
    res = subprocess.run(
        [NODE_PATH, controller, "state", operation],
        input=json.dumps(req),
        text=True,
        capture_output=True,
        cwd=project,
        env=env
    )
    lines = res.stdout.strip().split("\n")
    data = json.loads(lines[-1]) if lines and lines[-1] else {}
    return res.returncode, data

def run_interactive_human_decision(controller, home, project, task_run_id, expected_rev, payload, response_mode="correct"):
    req = {
        "protocol": "evcrate-advisor-state",
        "version": 1,
        "operation": "human-decision",
        "task_run_id": task_run_id,
        "operation_id": str(uuid.uuid4()),
        "expected_revision": expected_rev,
        "payload": payload
    }
    json_input = json.dumps(req).encode("utf-8")

    master_fd, slave_fd = pty.openpty()

    env = os.environ.copy()
    env["HOME"] = home
    env["USERPROFILE"] = home

    # stdin from pipe, stdout from pipe, stderr to slave_fd (TTY)
    # The controller's observeTerminalDecision requires stderr.isTTY and opens /dev/tty
    pipe_r, pipe_w = os.pipe()
    os.write(pipe_w, json_input)
    os.close(pipe_w)

    stdout_r, stdout_w = os.pipe()

    pid = os.fork()
    if pid == 0:
        # Child process
        os.close(master_fd)
        os.close(stdout_r)

        # Set slave as controlling terminal for session
        os.setsid()
        # TIOCSCTTY is platform-specific, ioctl or reopening slave_fd
        try:
            import fcntl, termios
            fcntl.ioctl(slave_fd, termios.TIOCSCTTY, 0)
        except Exception:
            pass

        os.dup2(pipe_r, 0)
        os.dup2(stdout_w, 1)
        os.dup2(slave_fd, 2)

        os.close(pipe_r)
        os.close(stdout_w)
        os.close(slave_fd)

        os.chdir(project)
        os.execve(NODE_PATH, [NODE_PATH, controller, "state", "human-decision"], env)
        sys.exit(1)

    # Parent process
    os.close(pipe_r)
    os.close(stdout_w)
    os.close(slave_fd)

    # Read from master_fd until challenge prompt appears
    output = b""
    challenge = None
    start_time = time.time()

    while time.time() - start_time < 10:
        try:
            chunk = os.read(master_fd, 1024)
            if not chunk:
                break
            output += chunk
            text = output.decode("utf-8", errors="replace")
            if "Type exactly:" in text and "> " in text:
                # Extract challenge string: authorize <run_id> <rev> <nonce>
                parts = text.split("Type exactly:")
                challenge_line = parts[1].split("\n")[0].strip()
                challenge = challenge_line
                break
        except Exception:
            break

    if response_mode == "abort":
        # Send SIGINT or EOF
        os.write(master_fd, b"\x03") # Ctrl+C
    elif response_mode == "wrong_nonce":
        os.write(master_fd, b"authorize 00000000-0000-0000-0000-000000000000 1 badnonce\n")
    elif response_mode == "correct":
        if challenge:
            os.write(master_fd, (challenge + "\n").encode("utf-8"))
        else:
            raise RuntimeError("Challenge was not received from terminal: " + output.decode("utf-8", errors="replace"))

    # Wait for child to exit
    _, status = os.waitpid(pid, 0)
    exit_code = os.waitstatus_to_exitcode(status)

    os.close(master_fd)
    out_bytes = os.read(stdout_r, 65536)
    os.close(stdout_r)

    stdout_text = out_bytes.decode("utf-8", errors="replace").strip()
    lines = stdout_text.split("\n")
    result_data = json.loads(lines[-1]) if lines and lines[-1] else {}

    return exit_code, result_data, challenge

def main():
    root = tempfile.mkdtemp(prefix="evcrate-console-test-")
    home = os.path.join(root, "home")
    project = os.path.join(root, "project")
    bin_dir = os.path.join(root, "bin")

    for d in [home, project, bin_dir, os.path.join(home, ".evcrate")]:
        os.makedirs(d, mode=0o700, exist_ok=True)

    # Initialize git repo in project
    subprocess.run(["git", "init"], cwd=project, capture_output=True, check=True)
    subprocess.run(["git", "config", "user.name", "Test"], cwd=project, capture_output=True, check=True)
    subprocess.run(["git", "config", "user.email", "test@test.com"], cwd=project, capture_output=True, check=True)
    with open(os.path.join(project, "source.txt"), "w") as f:
        f.write("source\n")
    subprocess.run(["git", "add", "source.txt"], cwd=project, capture_output=True, check=True)
    subprocess.run(["git", "commit", "-m", "init"], cwd=project, capture_output=True, check=True)

    # Copy controller from source to private home
    source_controller = os.path.join(PACKAGE_ROOT, ".evcrate/source/.evcrate/bin/evcrate-advisor")
    installed_bin = os.path.join(home, ".evcrate/bin")
    os.makedirs(installed_bin, exist_ok=True)
    shutil.copytree(
        os.path.join(PACKAGE_ROOT, ".evcrate/source/.evcrate/bin"),
        installed_bin,
        dirs_exist_ok=True
    )
    installed_controller = os.path.join(installed_bin, "evcrate-advisor")

    # Write basic policy
    with open(os.path.join(home, ".evcrate/advisor-routing.json"), "w") as f:
        json.dump({"version": 2, "advisor": {"primary": {"backend": "codex", "model": "m", "effort": "high"}}}, f)

    task = {
        "goal": "Verify interactive console",
        "non_goals": [],
        "authorized_paths": ["source.txt"],
        "scope_rationale": "Console test",
        "invariants": [],
        "success_criteria": ["Done"]
    }

    try:
        # 1. SCENARIO A: Wrong/replayed nonce refuses
        task_run_id_a = str(uuid.uuid4())
        code, init_a = run_controller_state(installed_controller, home, project, "init", task_run_id_a, 0, {
            "phase_id": "phase-03", "task": task, "baseline_paths": ["source.txt"]
        })
        assert code == 0, f"init A failed: {init_a}"
        assert init_a["status"] == "STATE_READY"

        exit_code, res, challenge = run_interactive_human_decision(
            installed_controller, home, project, task_run_id_a, 1,
            {"action": "abandon", "rationale": "Testing wrong nonce", "authorized_paths": []},
            response_mode="wrong_nonce"
        )
        assert exit_code == 1, f"Expected exit code 1 for wrong nonce, got {exit_code}"
        assert res.get("status") == "FAILED", f"Expected FAILED, got {res}"
        assert res.get("error", {}).get("code") == "HUMAN_EVENT_REQUIRED", f"Expected HUMAN_EVENT_REQUIRED, got {res}"
        print("✓ Scenario A PASSED: Wrong/replayed nonce refused with HUMAN_EVENT_REQUIRED")

        # 2. SCENARIO B: Current exact challenge accepts
        task_run_id_b = str(uuid.uuid4())
        code, init_b = run_controller_state(installed_controller, home, project, "init", task_run_id_b, 0, {
            "phase_id": "phase-03", "task": task, "baseline_paths": ["source.txt"]
        })
        assert code == 0, f"init B failed: {init_b}"

        exit_code, res, challenge = run_interactive_human_decision(
            installed_controller, home, project, task_run_id_b, 1,
            {"action": "abandon", "rationale": "Testing correct challenge", "authorized_paths": []},
            response_mode="correct"
        )
        assert exit_code == 0, f"Expected exit code 0 for correct challenge, got {exit_code}: {res}"
        assert res.get("status") == "STATE_READY", f"Expected STATE_READY, got {res}"
        assert res.get("state", {}).get("task_revision") == 2, f"Expected revision 2, got {res}"
        assert res.get("state", {}).get("gate_status") == "completed", f"Expected completed gate_status on abandon, got {res}"
        # Verify human decision entry in state
        human_decisions = res.get("state", {}).get("human_decisions", [])
        assert len(human_decisions) == 1, f"Expected 1 human decision, got {human_decisions}"
        assert human_decisions[0].get("source") == "local-terminal-confirmation", f"Expected source local-terminal-confirmation, got {human_decisions[0]}"
        print(f"✓ Scenario B PASSED: Exact challenge accepted ({challenge}), recorded source 'local-terminal-confirmation'")

        # 3. SCENARIO C: Abort cancels
        task_run_id_c = str(uuid.uuid4())
        code, init_c = run_controller_state(installed_controller, home, project, "init", task_run_id_c, 0, {
            "phase_id": "phase-03", "task": task, "baseline_paths": ["source.txt"]
        })
        assert code == 0, f"init C failed: {init_c}"

        exit_code, res, challenge = run_interactive_human_decision(
            installed_controller, home, project, task_run_id_c, 1,
            {"action": "abandon", "rationale": "Testing abort", "authorized_paths": []},
            response_mode="abort"
        )
        assert exit_code != 0, f"Expected non-zero exit code for abort, got {exit_code}"
        assert res.get("status") == "FAILED", f"Expected FAILED, got {res}"
        assert res.get("error", {}).get("code") in ["CANCELLED", "HUMAN_EVENT_REQUIRED"], f"Expected CANCELLED or HUMAN_EVENT_REQUIRED, got {res}"
        print("✓ Scenario C PASSED: Abort cancels with failure status")

        print("\nAll interactive console scenarios PASSED cleanly on Linux.")

    finally:
        shutil.rmtree(root, ignore_errors=True)

if __name__ == "__main__":
    main()
