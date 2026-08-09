# Native Pi Migration — Phase 01

**Status:** Implementation complete; live cutover pending
**Scope:** Pi target and distribution contract only
**Updated:** 2026-08-09

This historical Phase 01 record makes Pi a first-class distribution target without claiming native Pi runtime support. The canonical authoring source remains `.evcrate/source/.claude/`. Phase 03 has since implemented the runtime; its current boundary and release blockers are in the [System Architecture](./system-architecture.md#native-pi-phase-03-runtime-boundary-implemented-not-release-ready).

## Delivered contract

- `.evcrate/targets/manifest.json` registers `pi` through `.evcrate/targets/pi/manifest.json`.
- The Pi manifest owns one local output root, `.pi`, and one HOME binding: `.pi → .pi`.
- `DistributionContext` resolves `.evcrate/source/.pi` and `EVCRATE_HOME/.pi`; it does not use ad hoc HOME paths.
- Build/check invoke `migrate_claude_to_pi.py` with an empty, contained `PI_OUTPUT_DIR` equal to `PI_STAGE_ROOT/.pi`.
- The adapter accepts no direct or global output arguments and rejects missing, escaped, symlinked, or non-canonical paths.
- Build and publication verification hash the Pi adapter and the declared `pi_adapter/__init__.py` helper.
- The generated target is deterministic and currently contains only the minimal Pi skeleton shown below.
- Existing Claude, Codex/agents, Gemini, and Antigravity target contracts remain separate; Phase 01 does not refactor their ownership.

## Phase 01 generated artifact (historical)

```text
.evcrate/source/.pi/
├── .evcrate.json
├── .evcrateignore
└── agent/
    └── evcrate/
        └── managed-settings.json
```

At Phase 01 completion, this artifact did **not** include Pi commands, agents, skills, workflows, hooks, extensions, model-role data, or runtime resource translation. Those resources were added in later phases.

## Shared settings ownership

The target declares the typed `pi-settings-v1` shared file operation:

| Location | Role |
|---|---|
| `agent/evcrate/managed-settings.json` | Generated fragment containing EVCrate's exact package pins |
| `~/.pi/agent/settings.json` (`agent/settings.json` in the `.pi` root) | User-owned shared Pi settings file, merged only inside the candidate |
| `packages` | The only managed settings key in Phase 01 |

The managed pins are exact:

| Package | Pin |
|---|---:|
| `pi-subagents` | `0.44.0` |
| `@juicesharp/rpiv-ask-user-question` | `2.4.0` |

Publication may create or replace only these EVCrate package identities. It preserves unrelated keys and package entries, including user provider/model settings and Pi session data. `agent/settings.json` is not recorded in file-level `managed_paths`; its dry-run and candidate merge use the same pure plan and report `merge-create`, `merge-update`, `noop`, or `conflict`.

Malformed or symlinked settings fail closed. Existing `pi-code` identities are reported as a conflict; real publication stops with manual-removal instructions and never removes `pi-code` automatically.

## Publication safety

- Build and check operate on isolated staging output. Publish consumes a current verified build and does not run migrators.
- `EVCRATE_HOME` selects the test or publication HOME root. `PI_CODING_AGENT_DIR` is not an alternate publication destination in Phase 01; runtime-only resource-root behavior belongs to a later phase.
- Live Pi must be manually quiescent before publishing. The publisher snapshots the Pi HOME root and rechecks it before promotion; concurrent session, package, settings, or other HOME changes abort promotion and recover the candidate.
- Use an isolated `EVCRATE_HOME` for validation. Phase 01 provides no live cutover instruction or approval to change a user's normal Pi installation.

## Phase status

| Phase | Scope | Status |
|---|---|---|
| 01 | Target, staging, hashing, shared settings, and safe candidate publication | **Complete** |
| 02 | Deterministic commands, agents, workflows, skills, scripts, and resource migration | Complete |
| 03 | Native commands, structured delegation, and model roles | Implemented; release blocked |
| 04 | Native hooks and finalized managed settings behavior | Pending |
| 05 | Integration, safety, release gates, and native Pi smoke tests | Pending |
| 06 | User documentation, manual `pi-code` removal, and live cutover | Pending |

Phase 01 remains the distribution baseline. Phase 03 is runtime-implemented but not release-ready: XML closing-tag marker corruption and a shell descendant timeout/process-tree leak are accepted unresolved criticals.

## References

- [Project overview and PDR](./project-overview-pdr.md)
- [System architecture](./system-architecture.md)
- [Codebase summary](./codebase-summary.md)
- [Project roadmap](./project-roadmap.md)
- [Native Pi migration plan](../plans/260809-native-pi-migration/plan.md)
