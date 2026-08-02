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

    @property
    def local_gemini(self) -> Path:
        return self.repository / ".gemini"

    @property
    def local_codex(self) -> Path:
        return self.repository / ".codex"

    @property
    def local_agents(self) -> Path:
        return self.repository / ".agents"

    @property
    def local_claude(self) -> Path:
        return self.repository / ".claude"

    @property
    def local_roots(self) -> tuple[Path, ...]:
        return (self.local_gemini, self.local_codex, self.local_agents)

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


def create_context(
    action: DistributionAction,
    *,
    stage: Path | None = None,
    environ: dict[str, str] | None = None,
) -> DistributionContext:
    """Resolve paths independently from the caller's current directory."""

    env = os.environ if environ is None else environ
    repository = Path(__file__).resolve().parents[1]
    home = Path(env.get("DEVKIT_HOME", str(Path.home()))).expanduser().resolve()
    resolved_stage = stage.resolve() if stage is not None else None
    return DistributionContext(
        action=action,
        repository=repository,
        home=home,
        stage=resolved_stage,
        global_sync_mode=env.get("DEVKIT_GLOBAL_SYNC_MODE", "managed"),
        gemini_global_mode=env.get("GEMINI_GLOBAL_MODE", "config-and-scripts"),
    )
