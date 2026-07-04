#!/usr/bin/env python3
import os
import sys
import shutil
import json
import subprocess
import argparse
import tempfile
import filecmp
from pathlib import Path

# Import from modular utilities
from distribute_utils import (
    devkit_dir, target_gemini, target_codex, target_agy_config,
    devkit_global_sync_mode
)
from distribute_sync import (
    sync_gemini_assets, sync_codex_and_agents_assets, sync_antigravity_config,
    sync_legacy_claude_assets
)

def run_migration_scripts():
    migrate_gemini = devkit_dir / "migrate_claude_to_gemini.py"
    if migrate_gemini.exists():
        print("🔄 Syncing .claude -> .gemini changes...")
        try:
            # Writes directly to local .gemini folder in normal mode
            subprocess.run([sys.executable, str(migrate_gemini)], check=False)
        except OSError as e:
            print(f"❌ Error executing migrate_claude_to_gemini.py: {e}", file=sys.stderr)
    else:
        print("⚠️ Warning: migrate_claude_to_gemini.py not found. Skipping project-level migration.")

    migrate_codex_py = devkit_dir / "migrate_claude_to_codex.py"
    if migrate_codex_py.exists():
        print("🔄 Syncing .claude -> .codex/.agents changes...")
        try:
            # Writes directly to local .codex/.agents folders in normal mode
            subprocess.run([sys.executable, str(migrate_codex_py)], check=False)
        except OSError as e:
            print(f"❌ Error executing Codex migration script: {e}", file=sys.stderr)
    else:
        print("⚠️ Warning: migrate_claude_to_codex.py not found. Skipping Codex migration.")

def are_json_files_equal_ignoring_keys(file1: Path, file2: Path, ignore_keys: list[str]) -> bool:
    try:
        data1 = json.loads(file1.read_text(encoding="utf-8"))
        data2 = json.loads(file2.read_text(encoding="utf-8"))
        
        def clean_data(d):
            if isinstance(d, dict):
                return {k: clean_data(v) for k, v in d.items() if k not in ignore_keys}
            elif isinstance(d, list):
                return [clean_data(x) for x in d]
            return d
            
        return clean_data(data1) == clean_data(data2)
    except Exception:
        return False

def get_dir_diffs(src_dir: Path, target_dir: Path, rel_path: Path = Path("")) -> list[str]:
    diffs = []
    
    if not src_dir.exists():
        if target_dir.exists():
            diffs.append(f"Extra directory in target: {rel_path}")
        return diffs
    if not target_dir.exists():
        diffs.append(f"Missing directory in target: {rel_path}")
        return diffs
        
    # Ignore compiled/log/runtime files that are transient or env-specific.
    # FUSE/overlay filesystems leave transient .fuse_hidden* files that should
    # not be treated as real content differences.
    ignore_files = {
        '.git', '__pycache__', '.DS_Store', '.coverage', 
        'runtime.env', 'test_failures.log', '.pytest_cache'
    }
    
    def is_ignored(name: str) -> bool:
        return name in ignore_files or name.startswith('.fuse_hidden')
    
    src_items = {item.name: item for item in src_dir.iterdir() if not is_ignored(item.name)}
    target_items = {item.name: item for item in target_dir.iterdir() if not is_ignored(item.name)}
    
    for name, src_item in src_items.items():
        curr_rel = rel_path / name
        if name.endswith(('.pyc', '.pyo', '.log')):
            continue
            
        if name not in target_items:
            diffs.append(f"Missing in target: {curr_rel}")
            continue
            
        target_item = target_items[name]
        if src_item.is_dir() != target_item.is_dir():
            diffs.append(f"Type mismatch (file vs dir) at: {curr_rel}")
            continue
            
        if src_item.is_dir():
            diffs.extend(get_dir_diffs(src_item, target_item, curr_rel))
        else:
            if name == 'migration-behavior-matrix.json':
                if not are_json_files_equal_ignoring_keys(src_item, target_item, ['generated_at']):
                    diffs.append(f"Content mismatch in: {curr_rel}")
            elif not filecmp.cmp(src_item, target_item, shallow=False):
                diffs.append(f"Content mismatch in: {curr_rel}")
                
    for name in target_items:
        curr_rel = rel_path / name
        if name.endswith(('.pyc', '.pyo', '.log')):
            continue
        if name not in src_items:
            diffs.append(f"Extra in target: {curr_rel}")
            
    return diffs

def run_check():
    print("🔍 Running distribute integrity check...")
    with tempfile.TemporaryDirectory() as temp_dir_str:
        temp_dir = Path(temp_dir_str)
        
        temp_gemini = temp_dir / ".gemini"
        temp_codex = temp_dir / ".codex"
        temp_agents = temp_dir / ".agents"
        
        # Create temp output directories
        temp_gemini.mkdir(parents=True, exist_ok=True)
        temp_codex.mkdir(parents=True, exist_ok=True)
        temp_agents.mkdir(parents=True, exist_ok=True)
        
        # Run migrations targeting the temp directories
        env = os.environ.copy()
        env["GEMINI_OUTPUT_DIR"] = str(temp_gemini)
        env["CODEX_OUTPUT_DIR"] = str(temp_codex)
        env["AGENTS_OUTPUT_DIR"] = str(temp_agents)
        
        migrate_gemini = devkit_dir / "migrate_claude_to_gemini.py"
        migrate_codex_py = devkit_dir / "migrate_claude_to_codex.py"
        
        if migrate_gemini.exists():
            print("🔄 Simulating .claude -> .gemini changes...")
            subprocess.run([sys.executable, str(migrate_gemini)], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
        else:
            print("⚠️ Warning: migrate_claude_to_gemini.py not found.")
            
        if migrate_codex_py.exists():
            print("🔄 Simulating .claude -> .codex/.agents changes...")
            subprocess.run([sys.executable, str(migrate_codex_py)], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
        else:
            print("⚠️ Warning: migrate_claude_to_codex.py not found.")
            
        # Compare local workspace folders with simulated temp folders
        local_gemini = devkit_dir / ".gemini"
        local_codex = devkit_dir / ".codex"
        local_agents = devkit_dir / ".agents"
        
        diffs = []
        if local_gemini.exists():
            diffs.extend(get_dir_diffs(temp_gemini, local_gemini, Path(".gemini")))
        else:
            diffs.append("Local .gemini directory is missing.")
            
        if local_codex.exists():
            diffs.extend(get_dir_diffs(temp_codex, local_codex, Path(".codex")))
        else:
            diffs.append("Local .codex directory is missing.")
            
        if local_agents.exists():
            diffs.extend(get_dir_diffs(temp_agents, local_agents, Path(".agents")))
        else:
            diffs.append("Local .agents directory is missing.")
            
        if diffs:
            print("\n❌ Distribute check FAILED. The following differences were found:")
            for d in diffs:
                print(f"  - {d}")
            print("\n👉 Run 'npm run distribute' or 'python3 distribute.py' to regenerate downstream assets.")
            sys.exit(1)
        else:
            print("\n✅ Distribute check PASSED. All local generated assets are fully in sync with .claude baseline.")
            sys.exit(0)

def print_summary():
    print("✅ Distribution complete! Your global configurations are now synced with devkit.")
    gemini_settings = target_gemini / "settings.json"
    if gemini_settings.exists():
        try:
            data = json.loads(gemini_settings.read_text(encoding="utf-8"))
            model_name = data.get("model", {}).get("name", "unknown")
            print(f"   Model set to: {model_name}")
        except (json.JSONDecodeError, OSError):
            print("   Model set to: unknown")
    
    codex_config = target_codex / "config.toml"
    if codex_config.exists():
        try:
            model_name = "unknown"
            for line in codex_config.read_text(encoding="utf-8").splitlines():
                if line.strip().startswith("model ="):
                    parts = line.split("=")
                    if len(parts) > 1:
                        model_name = parts[1].strip().strip('"').strip("'")
                        break
            print(f"   Codex model set to: {model_name}")
        except OSError:
            pass

def main():
    parser = argparse.ArgumentParser(description="Distribute DevKit configuration to target directories.")
    parser.add_argument("--check", action="store_true", help="Perform integrity validation check between .claude and generated folders.")
    args = parser.parse_args()

    if args.check:
        run_check()

    print(f"🚀 Starting distribution from {devkit_dir}...")
    print(f"   Global sync mode: {devkit_global_sync_mode}")
    if devkit_global_sync_mode not in ("managed", "full"):
        print("❌ Error: DEVKIT_GLOBAL_SYNC_MODE must be 'managed' or 'full'.", file=sys.stderr)
        sys.exit(1)

    run_migration_scripts()
    sync_gemini_assets()
    sync_codex_and_agents_assets(devkit_dir) # Sync from newly compiled workspace directory
    sync_antigravity_config()
    sync_legacy_claude_assets()
    print_summary()

if __name__ == "__main__":
    main()
