#!/usr/bin/env python3
import json
import re
import shutil
import tempfile
from pathlib import Path

from distribution.context import DistributionContext
from distribution.antigravity_publish import publish_antigravity_config
from distribute_utils import remove_managed_paths, remove_path, reset_dir_contents, sync_tree, write_codex_runtime_env
from distribute_hooks import rewrite_codex_global_paths

def sync_gemini_assets(context: DistributionContext):
    devkit_gemini = context.local_gemini
    target_gemini = context.target_gemini
    gemini_global_mode = context.gemini_global_mode
    if not devkit_gemini.exists():
        raise RuntimeError("Local .gemini artifact is missing")
        
    target_gemini.mkdir(parents=True, exist_ok=True)
    print(f"🧹 Syncing global Gemini assets (mode: {gemini_global_mode})")
    
    settings_src = devkit_gemini / "settings.json"
    if settings_src.exists():
        shutil.copy2(settings_src, target_gemini / "settings.json")
        settings_dest = target_gemini / "settings.json"
        try:
            data = json.loads(settings_dest.read_text(encoding="utf-8"))
            hook_root = Path(target_gemini / "hooks").as_posix()
            
            for event_groups in data.get("hooks", {}).values():
                for group in event_groups:
                    for hook in group.get("hooks", []):
                        command = hook.get("command")
                        if isinstance(command, str):
                            command = re.sub(
                                r'(?:node\s+)?\"?\$GEMINI_PROJECT_DIR\"?/\.gemini/hooks',
                                hook_root,
                                command
                            )
                            hook["command"] = command
            settings_dest.write_text(json.dumps(data, indent=2), encoding="utf-8")
        except (json.JSONDecodeError, OSError) as error:
            raise RuntimeError(f"Failed to rewrite Gemini settings.json: {error}") from error

    for subdir in ["scripts", "hooks"]:
        if (devkit_gemini / subdir).exists():
            subdir_dest = target_gemini / subdir
            if subdir_dest.exists():
                shutil.rmtree(subdir_dest)
            shutil.copytree(devkit_gemini / subdir, subdir_dest, dirs_exist_ok=True)

    subdirs = ["agents", "commands", "skills", "workflows"]
    if gemini_global_mode == "full":
        for subdir in subdirs:
            if (devkit_gemini / subdir).exists():
                subdir_dest = target_gemini / subdir
                if subdir_dest.exists():
                    shutil.rmtree(subdir_dest)
                shutil.copytree(devkit_gemini / subdir, subdir_dest, dirs_exist_ok=True)
    else:
        for subdir in subdirs:
            subdir_dest = target_gemini / subdir
            if subdir_dest.exists():
                shutil.rmtree(subdir_dest)
        print("ℹ️ Skipping ~/.gemini/{agents,commands,skills,workflows} to avoid user/workspace duplication.")
        print("   Hooks and scripts are still synced globally because they do not create duplicated command/skill registries.")

def sync_codex_and_agents_assets(context: DistributionContext):
    codex_source = context.local_codex
    agents_source = context.local_agents
    target_codex = context.target_codex
    target_agents = context.target_agents
    devkit_global_sync_mode = context.global_sync_mode

    if codex_source.exists():
        if devkit_global_sync_mode == "full":
            print(f"🧹 Fully replacing global Codex directory: {target_codex}")
            reset_dir_contents(target_codex)
        else:
            print(f"🧹 Removing managed Codex assets only: {target_codex}")
            remove_managed_paths(target_codex, [
                "agents", "bin", "commands", "hooks", "workflows",
                "config.toml", "global-guidance.md", "hooks.json",
                "migration-behavior-matrix.json"
            ])
        
        print("📦 Copying .codex items...")
        managed_skip_names = set() if devkit_global_sync_mode == "full" else {".devkit.json"}
        if managed_skip_names:
            print("🔒 Preserving user-owned global Codex config: .devkit.json")
        sync_tree(codex_source, target_codex, skip_names=managed_skip_names)
        write_codex_runtime_env(target_codex / "runtime.env")
        rewrite_codex_global_paths(target_codex)
    else:
        raise RuntimeError("Local .codex artifact is missing")

    if agents_source.exists():
        if devkit_global_sync_mode == "full":
            print(f"🧹 Fully replacing global Codex agents directory: {target_agents}")
            reset_dir_contents(target_agents)
        else:
            print(f"🧹 Removing managed Codex agents assets only: {target_agents}")
            remove_managed_paths(target_agents, ["skills"])

        print("📦 Copying .agents items...")
        sync_tree(agents_source, target_agents)
    else:
        raise RuntimeError("Local .agents artifact is missing")

def sync_antigravity_config(context: DistributionContext):
    print("📦 Publishing legacy Antigravity configuration...")
    publish_antigravity_config(context)

def sync_legacy_claude_assets(context: DistributionContext):
    claude_source = context.local_claude
    target_claude = context.target_claude
    devkit_global_sync_mode = context.global_sync_mode
    if claude_source.exists():
        print(f"📦 Syncing legacy .claude items to {target_claude}...")
        if devkit_global_sync_mode == "full":
            print(f"🧹 Fully replacing legacy Claude directory: {target_claude}")
            if target_claude.exists():
                shutil.rmtree(target_claude)
            target_claude.mkdir(parents=True, exist_ok=True)
        else:
            print(f"🧹 Removing managed Claude assets only: {target_claude}")
            remove_managed_paths(target_claude, [
                "agents", "commands", "hooks", "scripts", "skills", "workflows",
                "settings.json", ".mcp.json.example", "statusline.cjs", ".ckignore"
            ])
        sync_tree(claude_source, target_claude)


def publish_local_artifacts(context: DistributionContext) -> None:
    """Legacy publisher routed behind the explicit Phase 1 publish gate."""
    with tempfile.TemporaryDirectory(prefix=".devkit-home-publish-", dir=context.home.parent) as temp:
        backup_root = Path(temp)
        targets = (context.target_gemini, context.target_codex, context.target_agents, context.target_claude)
        backups: list[tuple[Path | None, Path]] = []
        try:
            for target in targets:
                if target.exists():
                    backup = backup_root / target.name
                    shutil.copytree(target, backup, symlinks=True)
                    backups.append((backup, target))
                else:
                    backups.append((None, target))
            sync_gemini_assets(context)
            sync_codex_and_agents_assets(context)
            sync_antigravity_config(context)
            sync_legacy_claude_assets(context)
        except Exception:
            for backup, target in reversed(backups):
                if target.exists():
                    remove_path(target)
                if backup is not None:
                    shutil.copytree(backup, target, symlinks=True)
            raise
