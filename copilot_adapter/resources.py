"""Copilot adapter aliases for the repository's path-safe resource helpers."""

from omp_adapter.resources import (
    ResourceError,
    copy_file,
    copy_tree,
    ensure_parent,
    production_files,
    read_json,
    relative_path,
    walk_files,
    write_json,
)

__all__ = [
    "ResourceError",
    "copy_file",
    "copy_tree",
    "ensure_parent",
    "production_files",
    "read_json",
    "relative_path",
    "walk_files",
    "write_json",
]
