#!/usr/bin/env python3
import os
import sys
import shutil
import tempfile
from pathlib import Path

# Configuration paths
script_dir = Path(__file__).resolve().parent
devkit_dir = Path(os.environ.get("DEVKIT_DIR", script_dir)).resolve()

home_dir = Path.home()
target_gemini = home_dir / ".gemini"
target_claude = home_dir / ".claude"
target_codex = home_dir / ".codex"
target_agents = home_dir / ".agents"
target_agy_config = target_gemini / "config"

# Secure unique temp stage directory
uid_suffix = f"-{os.getuid()}" if hasattr(os, "getuid") else "-win"
default_stage = Path(tempfile.gettempdir()) / f"devkit-codex-migration{uid_suffix}"
codex_stage = Path(os.environ.get("CODEX_STAGE", default_stage)).resolve()

gemini_global_mode = os.environ.get("GEMINI_GLOBAL_MODE", "config-and-scripts")
devkit_global_sync_mode = os.environ.get("DEVKIT_GLOBAL_SYNC_MODE", "managed")

def resolve_bin(name):
    bin_path = shutil.which(name)
    return bin_path if bin_path else ""

def reset_dir_contents(target_dir: Path):
    target_dir.mkdir(parents=True, exist_ok=True)
    for child in target_dir.iterdir():
        try:
            if child.is_dir() and not child.is_symlink():
                shutil.rmtree(child)
            else:
                child.unlink()
        except OSError as e:
            print(f"⚠️ Warning: Failed to delete {child}: {e}", file=sys.stderr)

def remove_managed_paths(target_dir: Path, rel_paths: list):
    target_dir.mkdir(parents=True, exist_ok=True)
    for rel_path in rel_paths:
        full_path = target_dir / rel_path
        if full_path.exists():
            try:
                if full_path.is_dir() and not full_path.is_symlink():
                    shutil.rmtree(full_path)
                else:
                    full_path.unlink()
            except OSError as e:
                print(f"⚠️ Warning: Failed to remove managed path {full_path}: {e}", file=sys.stderr)

def sync_tree(source_dir: Path, target_dir: Path, skip_names: set[str] | None = None):
    target_dir.mkdir(parents=True, exist_ok=True)
    skip_names = skip_names or set()
    for item in source_dir.iterdir():
        if item.name in skip_names:
            continue
        s = source_dir / item.name
        d = target_dir / item.name
        try:
            if s.is_dir():
                shutil.copytree(s, d, dirs_exist_ok=True)
            else:
                shutil.copy2(s, d)
        except OSError as e:
            print(f"⚠️ Warning: Failed to sync {s} to {d}: {e}", file=sys.stderr)

def write_codex_runtime_env(runtime_file: Path):
    node_bin = resolve_bin("node") or resolve_bin("nodejs")
    
    # Normalize paths to use POSIX-style slashes even on Windows for shell sourcing
    def get_posix_bin(name):
        b = resolve_bin(name)
        return Path(b).as_posix() if b else ""

    node_posix = Path(node_bin).as_posix() if node_bin else ""
    lines = [
        f'CODEX_NODE_BIN="{node_posix}"',
        f'CODEX_NPX_BIN="{get_posix_bin("npx")}"',
        f'CODEX_PNPM_BIN="{get_posix_bin("pnpm")}"',
        f'CODEX_BUNX_BIN="{get_posix_bin("bunx")}"',
        f'CODEX_YARN_BIN="{get_posix_bin("yarn")}"',
        f'CODEX_COREPACK_BIN="{get_posix_bin("corepack")}"'
    ]
    try:
        runtime_file.write_text("\n".join(lines) + "\n", encoding="utf-8")
    except OSError as e:
        print(f"⚠️ Warning: Failed to write runtime.env: {e}", file=sys.stderr)
