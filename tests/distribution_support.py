from __future__ import annotations

import os
from pathlib import Path

from distribution.context import DistributionContext
from distribution.contracts import DistributionAction, VerifiedArtifact

REPOSITORY = Path(__file__).resolve().parents[1]


def context_for(root: Path, targets: tuple[str, ...] = ("pi",), action: DistributionAction = DistributionAction.PUBLISH) -> DistributionContext:
    home = root / "home"
    state = root / "state"
    home.mkdir(parents=True, exist_ok=True, mode=0o700)
    state.mkdir(parents=True, exist_ok=True, mode=0o700)
    return DistributionContext(
        action=action,
        repository=REPOSITORY,
        home=home,
        stage=None,
        global_sync_mode="managed",
        gemini_global_mode="config-and-scripts",
        state_home=state,
        selected_target_names=targets,
    )


def artifact_for(context: DistributionContext) -> VerifiedArtifact:
    return VerifiedArtifact(context.repository, context.local_roots)


def clean_environment() -> dict[str, str]:
    environment = os.environ.copy()
    for key in tuple(environment):
        if any(token in key.upper() for token in ("KEY", "TOKEN", "SECRET", "PASSWORD", "AUTH", "CREDENTIAL", "COOKIE")):
            environment.pop(key, None)
    return environment


def tree_bytes(root: Path) -> dict[str, bytes]:
    return {
        path.relative_to(root).as_posix(): path.read_bytes()
        for path in sorted(root.rglob("*"))
        if path.is_file() and not path.is_symlink()
    }
