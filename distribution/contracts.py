"""Stable contracts shared by distribution command gates."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from pathlib import Path


class DistributionAction(str, Enum):
    BUILD = "build"
    CHECK = "check"
    PUBLISH = "publish"
    ALL = "all"
    RECOVER = "recover"


class DistributionError(RuntimeError):
    """Expected distribution failure with a stable command exit code."""

    exit_code = 1


class BuildError(DistributionError):
    exit_code = 2


class PublishError(DistributionError):
    exit_code = 3


@dataclass(frozen=True)
class VerifiedArtifact:
    """The only input accepted by the HOME publication gate in phase 1."""

    repository: Path
    roots: tuple[Path, ...]
