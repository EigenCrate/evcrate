#!/usr/bin/env python3
import os
import sys
import shutil
import json
import subprocess
from pathlib import Path

# Import from modular utilities
from distribute_utils import (
    devkit_dir, target_gemini, target_codex, target_agy_config, codex_stage,
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
            subprocess.run([sys.executable, str(migrate_gemini)], check=False)
        except OSError as e:
            print(f"❌ Error executing migrate_claude_to_gemini.py: {e}", file=sys.stderr)
    else:
        print("⚠️ Warning: migrate_claude_to_gemini.py not found. Skipping project-level migration.")

    migrate_codex_sh = devkit_dir / "migrate_claude_to_codex.sh"
    migrate_codex_py = devkit_dir / "migrate_claude_to_codex.py"
    
    if codex_stage.exists():
        try:
            shutil.rmtree(codex_stage)
        except OSError:
            pass
    codex_stage.mkdir(parents=True, exist_ok=True)
    
    env = os.environ.copy()
    env["CODEX_STAGE"] = str(codex_stage)
    env["CODEX_OUTPUT_DIR"] = str(codex_stage / ".codex")
    env["AGENTS_OUTPUT_DIR"] = str(codex_stage / ".agents")

    try:
        if migrate_codex_sh.exists() and os.name != 'nt':
            print("🔄 Syncing .claude -> .codex/.agents changes...")
            subprocess.run(["bash", str(migrate_codex_sh)], env=env, check=False)
        elif migrate_codex_py.exists():
            print("🔄 Syncing .claude -> .codex/.agents changes...")
            subprocess.run([sys.executable, str(migrate_codex_py)], env=env, check=False)
        else:
            print("⚠️ Warning: migrate_claude_to_codex.sh/py not found. Skipping Codex migration.")
    except OSError as e:
        print(f"❌ Error executing Codex migration script: {e}", file=sys.stderr)

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
    print(f"🚀 Starting distribution from {devkit_dir}...")
    print(f"   Global sync mode: {devkit_global_sync_mode}")
    if devkit_global_sync_mode not in ("managed", "full"):
        print("❌ Error: DEVKIT_GLOBAL_SYNC_MODE must be 'managed' or 'full'.", file=sys.stderr)
        sys.exit(1)

    run_migration_scripts()
    sync_gemini_assets()
    sync_codex_and_agents_assets(codex_stage)
    sync_antigravity_config()
    sync_legacy_claude_assets()
    print_summary()

if __name__ == "__main__":
    main()
