"""Immutable, resolved paths for one distribution invocation."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from .contracts import DistributionAction


@dataclass(frozen=True)
class DistributionContext:
    action: DistributionAction
    repository: Path
    home: Path
    stage: Path | None
    global_sync_mode: str
    gemini_global_mode: str
    state_home: Path | None = None

    @property
    def source_root(self) -> Path:
        """Physical repository root for all project-local agent configuration."""

        return self.repository / ".evcrate" / "source"

    @property
    def config_root(self) -> Path:
        """Compatibility name for callers that treat source as the config root."""

        return self.source_root

    def local_path(self, logical_name: str) -> Path:
        """Resolve a logical local artifact name inside the nested source root."""

        return self.source_root / logical_name

    @property
    def local_gemini(self) -> Path:
        return self.local_path(".gemini")

    @property
    def local_codex(self) -> Path:
        return self.local_path(".codex")

    @property
    def local_agents(self) -> Path:
        return self.local_path(".agents")

    @property
    def local_antigravity(self) -> Path:
        return self.local_path(".antigravity")

    @property
    def local_claude(self) -> Path:
        return self.local_path(".claude")

    @property
    def local_roots(self) -> tuple[Path, ...]:
        return (self.local_gemini, self.local_codex, self.local_agents, self.local_antigravity, self.local_claude)

    @property
    def local_project_docs(self) -> tuple[Path, ...]:
        return tuple(self.local_path(name) for name in ("AGENTS.md", "GEMINI.md"))

    @property
    def legacy_local_paths(self) -> tuple[Path, ...]:
        return tuple(self.repository / name for name in (
            ".claude", ".codex", ".agents", ".gemini", ".antigravity", ".opencode",
            "CLAUDE.md", "AGENTS.md", "GEMINI.md",
        ))

    @property
    def stage_project_docs(self) -> Path:
        if self.stage is None:
            raise RuntimeError("This action has no staging directory")
        return self.stage / "project-docs"

    @property
    def target_gemini(self) -> Path:
        return self.home / ".gemini"

    @property
    def target_claude(self) -> Path:
        return self.home / ".claude"

    @property
    def target_codex(self) -> Path:
        return self.home / ".codex"

    @property
    def target_agents(self) -> Path:
        return self.home / ".agents"

    @property
    def target_agy_config(self) -> Path:
        return self.target_gemini / "config"

    @property
    def state_dir(self) -> Path:
        """Return the owner-only state directory without relying on CWD."""

        if self.state_home is not None:
            return self.state_home
        return self.home / ".local" / "state" / "evcrate"


def create_context(
    action: DistributionAction,
    *,
    stage: Path | None = None,
    environ: dict[str, str] | None = None,
) -> DistributionContext:
    """Resolve paths independently from the caller's current directory."""

    env = os.environ if environ is None else environ
    repository = Path(__file__).resolve().parents[1]
    home = Path(env.get("EVCRATE_HOME", str(Path.home()))).expanduser().absolute()
    state_base = env.get("EVCRATE_STATE_HOME") or env.get("XDG_STATE_HOME")
    state_home = (
        Path(state_base).expanduser().absolute() / "evcrate"
        if state_base
        else home / ".local" / "state" / "evcrate"
    )
    resolved_stage = stage.resolve() if stage is not None else None
    return DistributionContext(
        action=action,
        repository=repository,
        home=home,
        stage=resolved_stage,
        global_sync_mode=env.get("EVCRATE_GLOBAL_SYNC_MODE", "managed"),
        gemini_global_mode=env.get("GEMINI_GLOBAL_MODE", "config-and-scripts"),
        state_home=state_home,
    )
