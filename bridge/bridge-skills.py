import os
import argparse
import shutil
from pathlib import Path

def setup_bridge(source_dir, target_dir, dry_run=False):
    """
    Bridges resources (Skills, Agents, Commands) into a standard format 
    recognized by both Gemini CLI and Claude.
    """
    source_base = Path(source_dir).resolve()
    target_base = Path(target_dir).resolve()

    # Mapping: Claude Subfolder -> How to process it
    # 'directory' = Link the folder as-is
    # 'file' = Create a folder and link the file inside as SKILL.md
    source_map = {
        "skills": "directory",
        "agents": "file",
        "commands": "file"
    }

    if not source_base.exists():
        print(f"❌ Source directory not found: {source_base}")
        return

    print(f"🚀 Bridging {source_base} ➡️  {target_base}")
    if dry_run: print("🔍 DRY RUN MODE - No changes will be made")

    if not dry_run:
        target_base.mkdir(parents=True, exist_ok=True)

    for sub_folder, mode in source_map.items():
        source_path = source_base / sub_folder
        if not source_path.exists():
            continue

        for item in source_path.iterdir():
            if item.name.startswith('.') or item.name == "__pycache__":
                continue

            # Target skill name (e.g., 'planner' or 'code-reviewer')
            skill_name = item.stem
            target_skill_dir = target_base / skill_name

            if mode == "directory" and item.is_dir():
                create_link(item, target_skill_dir, dry_run)
                
            elif mode == "file" and item.suffix == ".md":
                if not dry_run:
                    target_skill_dir.mkdir(exist_ok=True)
                create_link(item, target_skill_dir / "SKILL.md", dry_run)

    print("\n✅ Done! Reload your CLI to see changes.")

def create_link(source, target, dry_run):
    """Creates a symbolic link at target pointing to source."""
    if dry_run:
        print(f"   [DRY] Would link: {target.name} -> {source}")
        return

    try:
        # Clean up existing link/file
        if target.is_symlink() or target.exists():
            if target.is_dir() and not target.is_symlink():
                shutil.rmtree(target)
            else:
                target.unlink()
        
        # Use symlink_to with absolute paths to ensure links work everywhere
        target.symlink_to(source)
        print(f"   🔗 Linked: {target.name}")
    except Exception as e:
        print(f"   ❌ Error linking {target.name}: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Bridge Claude skills to Gemini CLI.")
    parser.add_argument("-s", "--source", default=".claude", help="Source folder (containing skills/agents/commands)")
    parser.add_argument("-t", "--target", default=".agents/skills", help="Target folder (e.g., .agents/skills or .gemini/skills)")
    parser.add_argument("--dry-run", action="store_true", help="Show what would happen without making changes")
    
    args = parser.parse_args()
    setup_bridge(args.source, args.target, args.dry_run)
