"""Immutable, resolved paths for one distribution invocation."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from .contracts import BuildError, DistributionAction


ALL_LOCAL_ROOT_NAMES = (".evcrate", ".gemini", ".codex", ".agents", ".antigravity", ".omp", ".claude", ".pi")


@dataclass(frozen=True)
class DistributionContext:
    action: DistributionAction
    repository: Path
    home: Path
    stage: Path | None
    global_sync_mode: str
    gemini_global_mode: str
    state_home: Path | None = None
    selected_target_names: tuple[str, ...] = ()

    @property
    def source_root(self) -> Path:
        return self.repository / ".evcrate" / "source"

    @property
    def config_root(self) -> Path:
        return self.source_root

    @property
    def local_evcrate(self) -> Path:
        return self.local_path(".evcrate")
    def local_path(self, logical_name: str) -> Path:
        return self.source_root / logical_name

    @property
    def local_gemini(self) -> Path:
        return self.local_path(".gemini")

    @property
    def local_omp(self) -> Path:
        return self.local_path(".omp")

    @property
    def local_pi(self) -> Path:
        return self.local_path(".pi")

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
        names = set(ALL_LOCAL_ROOT_NAMES) if not self.selected_target_names else self._selected_root_names()
        return tuple(self.local_path(name) for name in ALL_LOCAL_ROOT_NAMES if name in names)

    def _selected_root_names(self) -> set[str]:
        return {".evcrate"} | {root for manifest in self.selected_manifests for root in manifest.output_roots}

    @property
    def selected_manifests(self):
        """Load only manifests authorized by this immutable target selection."""

        from .manifest import load_target_manifest, load_target_registry

        registry = load_target_registry(self.repository / ".evcrate/targets/manifest.json")
        names = self.selected_target_names or tuple(registry.targets)
        manifests = []
        for name in names:
            manifest = load_target_manifest(registry.targets[name])
            if manifest.name != name:
                raise BuildError(f"Target registry key does not match manifest name: {name}")
            manifests.append(manifest)
        return tuple(manifests)

    @property
    def local_project_docs(self) -> tuple[Path, ...]:
        if not self.selected_target_names:
            names = ("AGENTS.md", "GEMINI.md")
        else:
            names = tuple(document for manifest in self.selected_manifests for document in manifest.project_docs)
        return tuple(self.local_path(name) for name in names)

    @property
    def legacy_local_paths(self) -> tuple[Path, ...]:
        return tuple(self.repository / name for name in (
            ".claude", ".codex", ".agents", ".gemini", ".antigravity", ".opencode", ".pi",
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
    def target_omp(self) -> Path:
        return self.home / ".omp"

    @property
    def target_pi(self) -> Path:
        return self.home / ".pi"

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
        if self.state_home is not None:
            return self.state_home
        return self.home / ".local" / "state" / "evcrate"


def create_context(
    action: DistributionAction,
    *,
    stage: Path | None = None,
    environ: dict[str, str] | None = None,
    selected_targets: tuple[str, ...] = (),
) -> DistributionContext:
    """Resolve paths and validate an optional target selection."""

    from .manifest import load_target_registry

    env = os.environ if environ is None else environ
    repository = Path(__file__).resolve().parents[1]
    registry = load_target_registry(repository / ".evcrate/targets/manifest.json")
    unknown = set(selected_targets).difference(registry.targets)
    if unknown:
        raise BuildError("Unknown distribution target: " + ", ".join(sorted(unknown)))
    if len(selected_targets) > 1 and set(selected_targets) != set(registry.targets):
        raise BuildError("Only one --target value may be selected")
    if len(selected_targets) != len(set(selected_targets)):
        raise BuildError("Distribution target selection contains duplicates")
    resolved_targets = selected_targets or tuple(registry.targets)
    home = Path(env.get("EVCRATE_HOME", str(Path.home()))).expanduser().absolute()
    state_base = env.get("EVCRATE_STATE_HOME") or env.get("XDG_STATE_HOME")
    state_home = Path(state_base).expanduser().absolute() / "evcrate" if state_base else home / ".local" / "state" / "evcrate"
    return DistributionContext(
        action=action, repository=repository, home=home,
        stage=stage.resolve() if stage is not None else None,
        global_sync_mode=env.get("EVCRATE_GLOBAL_SYNC_MODE", "managed"),
        gemini_global_mode=env.get("GEMINI_GLOBAL_MODE", "config-and-scripts"),
        state_home=state_home, selected_target_names=resolved_targets,
    )
