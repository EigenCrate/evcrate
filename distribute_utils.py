"""Filesystem helpers for the HOME publication adapter."""

from __future__ import annotations

import shutil
from pathlib import Path


def resolve_bin(name: str) -> str:
    return shutil.which(name) or ""


def reset_dir_contents(target_dir: Path) -> None:
    target_dir.mkdir(parents=True, exist_ok=True)
    for child in target_dir.iterdir():
        remove_path(child)


def remove_managed_paths(target_dir: Path, rel_paths: list[str]) -> None:
    target_dir.mkdir(parents=True, exist_ok=True)
    for rel_path in rel_paths:
        full_path = target_dir / rel_path
        if not full_path.exists():
            continue
        remove_path(full_path)


def remove_path(path: Path) -> None:
    """Remove a file, directory, or symlink without assuming its type."""
    if path.is_dir() and not path.is_symlink():
        shutil.rmtree(path)
    else:
        path.unlink()


def sync_tree(source_dir: Path, target_dir: Path, skip_names: set[str] | None = None) -> None:
    target_dir.mkdir(parents=True, exist_ok=True)
    for source in source_dir.iterdir():
        if source.name in (skip_names or set()):
            continue
        if source.is_symlink():
            raise OSError(f"Refusing to publish symlinked source: {source}")
        destination = target_dir / source.name
        if source.is_dir():
            shutil.copytree(source, destination, dirs_exist_ok=True)
        else:
            shutil.copy2(source, destination)


def write_codex_runtime_env(runtime_file: Path) -> None:
    def posix_bin(name: str) -> str:
        value = resolve_bin(name)
        return Path(value).as_posix() if value else ""

    runtime_file.write_text(
        "\n".join(
            [
                f'CODEX_NODE_BIN="{posix_bin("node") or posix_bin("nodejs")}"',
                f'CODEX_NPX_BIN="{posix_bin("npx")}"',
                f'CODEX_PNPM_BIN="{posix_bin("pnpm")}"',
                f'CODEX_BUNX_BIN="{posix_bin("bunx")}"',
                f'CODEX_YARN_BIN="{posix_bin("yarn")}"',
                f'CODEX_COREPACK_BIN="{posix_bin("corepack")}"',
            ]
        ) + "\n",
        encoding="utf-8",
    )
