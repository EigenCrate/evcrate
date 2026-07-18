#!/usr/bin/env python3
import json
import re
import shutil
import sys
from pathlib import Path

from distribute_utils import (
    devkit_dir, target_gemini, target_claude, target_codex, target_agents,
    target_agy_config, gemini_global_mode, devkit_global_sync_mode,
    reset_dir_contents, remove_managed_paths, sync_tree, write_codex_runtime_env
)
from distribute_hooks import (
    rewrite_codex_global_paths, rewrite_agy_global_paths
)

def sync_gemini_assets():
    devkit_gemini = devkit_dir / ".gemini"
    if not devkit_gemini.exists():
        print("❌ Error: .gemini not found in devkit.", file=sys.stderr)
        sys.exit(1)
        
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
        except (json.JSONDecodeError, OSError) as e:
            print(f"⚠️ Warning: Failed to rewrite Gemini settings.json: {e}", file=sys.stderr)

    for subdir in ["scripts", "hooks"]:
        if (devkit_gemini / subdir).exists():
            subdir_dest = target_gemini / subdir
            if subdir_dest.exists():
                try:
                    shutil.rmtree(subdir_dest)
                except OSError:
                    pass
            shutil.copytree(devkit_gemini / subdir, subdir_dest, dirs_exist_ok=True)

    subdirs = ["agents", "commands", "skills", "workflows"]
    if gemini_global_mode == "full":
        for subdir in subdirs:
            if (devkit_gemini / subdir).exists():
                subdir_dest = target_gemini / subdir
                if subdir_dest.exists():
                    try:
                        shutil.rmtree(subdir_dest)
                    except OSError:
                        pass
                shutil.copytree(devkit_gemini / subdir, subdir_dest, dirs_exist_ok=True)
    else:
        for subdir in subdirs:
            subdir_dest = target_gemini / subdir
            if subdir_dest.exists():
                try:
                    shutil.rmtree(subdir_dest)
                except OSError:
                    pass
        print("ℹ️ Skipping ~/.gemini/{agents,commands,skills,workflows} to avoid user/workspace duplication.")
        print("   Hooks and scripts are still synced globally because they do not create duplicated command/skill registries.")

def sync_codex_and_agents_assets(codex_stage: Path):
    codex_source = devkit_dir / ".codex"
    agents_source = devkit_dir / ".agents"
    if (codex_stage / ".codex").exists():
        codex_source = codex_stage / ".codex"
    if (codex_stage / ".agents").exists():
        agents_source = codex_stage / ".agents"

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
        print("⚠️ Warning: Codex source not found. Codex migration may have failed.")

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
        print("⚠️ Warning: Codex agents source not found. Codex skills migration may have failed.")

def sync_antigravity_config():
    claude_source = devkit_dir / ".claude"
    if claude_source.exists():
        if devkit_global_sync_mode == "full":
            print(f"🧹 Fully replacing global Antigravity config directory: {target_agy_config}")
            reset_dir_contents(target_agy_config)
        else:
            print(f"🧹 Removing managed Antigravity config assets only: {target_agy_config}")
            remove_managed_paths(target_agy_config, [
                "agents", "commands", "hooks", "scripts", "skills", "workflows",
                "settings.json", ".mcp.json.example", "statusline.cjs"
            ])

        print("📦 Copying .claude items to Antigravity config...")
        sync_tree(claude_source, target_agy_config)

        print("📦 Extracting hooks from settings.json...")
        settings_file = target_agy_config / "settings.json"
        hooks_file = target_agy_config / "hooks.json"
        if settings_file.exists():
            try:
                data = json.loads(settings_file.read_text(encoding="utf-8"))
                if "hooks" in data:
                    if "PreToolUse" in data["hooks"]:
                        for group in data["hooks"]["PreToolUse"]:
                            if "matcher" in group:
                                group["matcher"] = "run_command|grep_search|list_dir|view_file|replace_file_content|multi_replace_file_content|write_to_file"
                    hooks_file.write_text(json.dumps({"hooks": data["hooks"]}, indent=2), encoding="utf-8")
            except (json.JSONDecodeError, OSError) as e:
                print(f"Failed to extract hooks: {e}")

        print("🧹 Cleaning up legacy assets for Antigravity CLI...")
        for f in ["settings.json", ".devkit.json", ".mcp.json.example", "statusline.cjs", "statusline.ps1", "statusline.sh"]:
            p = target_agy_config / f
            if p.exists():
                try:
                    p.unlink()
                except OSError:
                    pass
        for d in ["agents", "commands"]:
            p = target_agy_config / d
            if p.exists():
                try:
                    shutil.rmtree(p)
                except OSError:
                    pass

        commands_dir = claude_source / "commands"
        if commands_dir.exists():
            print("📦 Converting legacy .claude slash commands to Antigravity skills...")
            target_skills = target_agy_config / "skills"
            target_skills.mkdir(parents=True, exist_ok=True)
            for md_file in commands_dir.rglob("*.md"):
                try:
                    rel_path = md_file.relative_to(commands_dir).with_suffix("")
                    cmd_name = str(rel_path).replace("\\", "/")

                    content = md_file.read_text(encoding="utf-8")
                    desc = "Migrated command from .claude"
                    for line in content.splitlines():
                        stripped = line.strip()
                        match = re.match(r'^description\s*:\s*(.*)$', stripped, re.IGNORECASE)
                        if match:
                            desc = match.group(1).strip()
                            if (desc.startswith('"') and desc.endswith('"')) or (desc.startswith("'") and desc.endswith("'")):
                                desc = desc[1:-1].strip()
                            break

                    skill_dir_name = "cmd_" + str(rel_path).replace("\\", "_").replace("/", "_")
                    skill_dir = target_skills / skill_dir_name
                    skill_dir.mkdir(parents=True, exist_ok=True)

                    skill_content = (
                        f"---\nname: {skill_dir_name}\ndescription: {desc}\n---\n"
                        f"# {skill_dir_name}\n\n"
                        f"Command Path: /{cmd_name}\n\n"
                        f"Description: {desc}\n\n"
                        f"{content}"
                    )
                    (skill_dir / "SKILL.md").write_text(skill_content, encoding="utf-8")
                except (OSError, Exception) as e:
                    print(f"Failed to convert slash command {md_file}: {e}")

        rewrite_agy_global_paths(target_agy_config)
    else:
        print("⚠️ Warning: Claude source not found. Antigravity config migration may have failed.")

def sync_legacy_claude_assets():
    claude_source = devkit_dir / ".claude"
    if claude_source.exists():
        print(f"📦 Syncing legacy .claude items to {target_claude}...")
        if devkit_global_sync_mode == "full":
            print(f"🧹 Fully replacing legacy Claude directory: {target_claude}")
            if target_claude.exists():
                try:
                    shutil.rmtree(target_claude)
                except OSError:
                    pass
            target_claude.mkdir(parents=True, exist_ok=True)
        else:
            print(f"🧹 Removing managed Claude assets only: {target_claude}")
            remove_managed_paths(target_claude, [
                "agents", "commands", "hooks", "scripts", "skills", "workflows",
                "settings.json", ".mcp.json.example", "statusline.cjs"
            ])
        sync_tree(claude_source, target_claude)
