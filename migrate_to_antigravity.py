import os
import shutil
import pathlib

def migrate_to_ide():
    base_path = pathlib.Path("/home/loidinh/ws/sharing/devkit")
    claude_path = base_path / ".claude"
    ide_path = base_path / ".agent"

    if not ide_path.exists():
        ide_path.mkdir()

    # Mappings
    mappings = [
        (claude_path / "skills", ide_path / "skills"),
        (claude_path / "workflows", ide_path / "workflows"),
        (claude_path / "agents", ide_path / "agents"),
    ]

    # Command migration
    commands_src = claude_path / "commands"
    commands_dst = ide_path / "commands"
    if not commands_dst.exists():
        commands_dst.mkdir()
    
    if commands_src.exists():
        for item in commands_src.iterdir():
            if item.is_dir():
                shutil.copytree(item, commands_dst / item.name, dirs_exist_ok=True)
            elif item.suffix == '.md':
                shutil.copy2(item, commands_dst / (item.stem + ".toml"))

    for src, dst in mappings:
        if src.exists():
            if dst.exists():
                shutil.rmtree(dst)
            shutil.copytree(src, dst)
            print(f"Migrated {src} to {dst}")


if __name__ == "__main__":
    migrate_to_ide()
