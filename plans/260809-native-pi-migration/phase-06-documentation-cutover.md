# Phase 06 — Documentation and Manual Cutover

## Context

- [Plan](./plan.md)
- [Phase 05](./phase-05-integration-validation.md)
- [Architecture](../../docs/system-architecture.md)

## Overview

- **Priority:** P1
- **Status:** DONE — documentation and implementation user-approved on 2026-08-09; live cutover is explicitly deferred and remains manual.
- **Goal:** document the supported Pi operating model and perform the user-controlled `pi-code` cutover only after all isolated gates pass.
- **Effort:** 3–5h plus user cutover

## Related files

### Modify

- `README.md` — Pi support, package prerequisites, build/publish, and co-install notes.
- `docs/system-architecture.md` — reconcile intended design with implemented files/events and final package pins.
- `docs/codebase-summary.md` — add `.pi`, migrator, extension, and shared-settings ownership.
- `docs/project-roadmap.md` — mark native Pi milestone and deferred `.agents` refactor/provider routes.
- `docs/project-changelog.md` and/or `CHANGELOG.md` — user-visible migration/cutover notes.
- `guide/COMMANDS.md` — native Pi command naming/path behavior if generated guide references differ.
- `package.json` metadata only if documentation wording changes it; runtime `files`, scripts, and Node baseline were release-gated in Phase 05.

### Create

- `docs/pi-native-migration.md` — operator guide, troubleshooting, model-role overrides, hook limitations, skill isolation, package upgrades, and rollback.
- `plans/260809-native-pi-migration/reports/validation-260809-native-pi-migration.md` — final evidence and known limitations.

## Documentation requirements

- State that `.evcrate/source/.claude` remains the only content-authoring source.
- Distinguish generated `.pi` resources from Pi-only extension glue in the target overlay.
- List exact package pins and the upgrade test requirement.
- Explain semantic roles and the built-in OpenAI Codex mapping; unknown providers inherit safely.
- Explain that user provider/model defaults are never managed.
- Document static workflow behavior and the absence of dynamic workflow dependencies.
- Document native hook reason mapping for new/resume/fork/reload, manual/automatic compaction, shutdown cleanup, and child-start delegation enrichment.
- Document Codex/Pi skill coexistence and the recommended isolated skill launch:

```bash
pi --no-skills --skill "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/skills"
```

- Document that settings cannot portably exclude only `~/.agents/skills` while retaining automatic `.pi` discovery.
- Document `pi-code` conflict detection, the requirement to stop/quiesce Pi during publication, concurrent-change abort behavior, and manual removal/rollback steps.
- Document that `evcrate_subagent` terminal completion is transport/execution completion; the parent remains responsible for requested result inspection, tests, review, and acceptance.

## Manual cutover sequence

1. Present Phase 05 evidence and request user approval to touch live Pi settings.
2. User removes `npm:pi-code` manually (`pi remove npm:pi-code` or equivalent settings edit), then exits all Pi processes that can write sessions/packages/settings.
3. Run `python3 distribute.py --publish --dry-run --json`; review only `.pi` managed files and EVCrate settings entries.
4. With Pi still quiescent, run publish; then start Pi with the explicit Pi skill path.
5. Verify `/plan`, one `evcrate_command` nested dispatch, `ask_user_question`, one `evcrate_subagent` child per role, and one blocked safety-hook fixture.
6. If startup/regression fails, use distribution recovery/backup and restore the prior package entry manually; do not auto-reinstall `pi-code`.
7. Record results and known warnings in the validation report.

## Success criteria

- User documentation contains no instruction to install/use `pi-code` for EVCrate.
- Architecture/codebase docs match actual ownership, paths, event seams, and provider behavior.
- Live dry-run is reviewed before publication and contains no unrelated settings changes.
- Post-cutover native Pi smoke passes; rollback instructions are tested/documented.
- Plan status changes to completed only after final evidence and user-approved live cutover, or records implementation-complete/cutover-pending explicitly.

## Risks and controls

- **Premature live change:** Phase 05 must be complete; cutover requires explicit user action/approval.
- **Documentation drift:** derive inventories/pins from generated artifacts in tests and copy exact values into docs.
- **Skill collision noise:** recommend the explicit launch form; do not hide or misstate Pi's default discovery behavior.
