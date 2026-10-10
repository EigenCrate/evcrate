# Pre-Upgrade Customization Backup Warning & Legacy Leftover Guidance

This document specifies the operational guidance and architectural invariants for upgrading `evcrate` across all supported targets, accounting for the hard cutover to unified `evc-*` resource naming and `AGENTS.md` canonical instructions (Phase 08).

---

## 1. Pre-Upgrade Managed-Customization Backup Warning

### Critical Ownership Policy
- **Recorded Ownership Controls Deletion**: Deletion of obsolete artifacts during publication is governed strictly by recorded ownership markers (`managed_paths` in publication markers), **not** by file modification timestamps, checksum divergence, or content freshness.
- **Edited Managed Files Will Be Deleted**: If a user locally edited an owned legacy file (for example, a command under `.claude/commands/`, `.omp/commands/`, `.agents/skills/`, or a document like `CLAUDE.md`), that file **will still be deleted** during upgrade because its legacy identifier is obsolete and absent from the new release plan.
- **Mandatory User Backup**: Users and automation systems must back up any local customizations made to managed files **before** running `publish --apply`, `distribute publish`, `distribute all`, or the automated platform installer scripts (`install.sh`, `install.ps1`).
- **Limitation of Automatic Rollback**: Installer recovery and publication transaction journals provide crash recovery and rollback for failed transactions, but they do **not** preserve obsolete files once a transaction successfully commits.

---

## 2. Universal Unmanaged Collision Protection

### Collision Refusal Across All Targets
During publication planning across all active targets (`claude`, `codex`, `antigravity`, `pi`, `omp`, `copilot`, and `vscode`), any unmanaged file located at a new unified resource destination is detected as a collision via `isMigratedDestination`:
- **Unified commands**: Any flat file or skill directory prefixed with `evc-cmd-` (e.g. `.claude/commands/evc-cmd-code.md`, `.agents/skills/evc-cmd-code/SKILL.md`, `.omp/agent/evcrate/commands/evc-cmd-code.md`).
- **Unified agents**: Any agent file or directory prefixed with `evc-` under target agent locations (e.g. `.claude/agents/evc-planner.md`).
- **Target-specific unified extensions**:
  - Copilot: `skills/evc-*`, `styles/evc-style-*`
  - VS Code Local: `skills/evc-cmd-*`, `agents/evc-*`
- **Canonical instructions**: Root and target `AGENTS.md`, `.github/copilot-instructions.md`, `.agents/rules/evcrate-antigravity.md`, and `.agents/hooks.json`.

### Fail-Closed Behavior
- **Zero Data Loss**: Unmanaged files are never overwritten or clobbered.
- **Conflict Action**: Publication planning flags the colliding destination with `action: 'conflict'`.
- **Atomic Abort**: Invoking `publishApply` throws `ControlPlaneError` with code `PUBLICATION_FAILED` (exit code 5) before executing any filesystem mutations. Users must relocate or remove colliding files before re-running publication.

---

## 3. HOME and Project Retired Binding Reconciliation

When upgrading an older publication and selecting Antigravity:
- **Owned Predecessor Sweep**: `reconcileRetiredBindings` plans deletion only for exact recorded Gemini predecessor files: `.gemini` leaves in HOME/project scopes and owned `GEMINI.md` in project scope. Existing active-binding pruning handles obsolete owned leaves such as `.claude/CLAUDE.md`.
- **Safe Predecessor Retention**: Untracked files and inherited Codex `.agents` residuals are preserved; there is no generic sweep of arbitrary old bindings.
- **Recoverable Application**: Retired deletions carry `cleanup: "retired-binding"` in schema-3 journals, authorized against exact predecessor ownership without adding Gemini to active targets or binding order. Snapshot, backup, workspace, progress and path checks remain strict; operation faults and process interruptions can restore owned files.
- **Scope Boundary**: HOME rollback includes its controller transaction. Project harness rollback does not undo the separately committed shared HOME phase.

---

## 4. Untracked Legacy Leftover Reporting & Manual Review

### Preservation of Untracked Artifacts
- **Byte-Identical Preservation**: Untracked legacy artifacts (such as legacy commands or agents created manually by users, or present prior to marker tracking) are never deleted automatically.
- **Additive Reporting**: Following every successful publication apply (`publish --apply`) or dry-run, evcrate executes `detectLegacyLeftovers` to perform a bounded, read-only inspection of known resource locations for unmanaged legacy artifacts.

### Leftover Record Structure
The reported records classify leftovers into five canonical kinds:
- `'command'`: Legacy unmanaged commands (e.g. `commands/code.md`, `cmd_code/SKILL.md`).
- `'agent'`: Legacy unmanaged agents (e.g. `agents/planner.md`).
- `'skill'`: Legacy unmanaged skills.
- `'style'`: Legacy unmanaged style rules.
- `'instruction'`: Legacy instruction documents (e.g. project-level `CLAUDE.md`, `GEMINI.md`).

### Machine and Human Interfaces

#### Machine JSON Interface (`--json`)
The `PublishApplyResultPayload` includes an optional `legacyLeftovers` array sorted deterministically by `target`, `path`, and `kind`:
```json
{
  "status": "published",
  "payload": {
    "scope": "home",
    "projectIdentity": null,
    "buildManifestPath": ".evcrate/build-manifest.json",
    "buildManifestDigest": "...",
    "phases": [ ... ],
    "legacyLeftovers": [
      {
        "target": "claude",
        "path": "agents/planner.md",
        "kind": "agent"
      },
      {
        "target": "claude",
        "path": "commands/code.md",
        "kind": "command"
      }
    ]
  }
}
```

#### Human TTY Output
Standard TTY output prints the `published` status followed by human-readable warnings:
```text
published
Warning: Preserved untracked legacy artifacts detected:
  - [claude] agents/planner.md (agent)
  - [claude] commands/code.md (command)
Manual review recommended: these unmanaged files were preserved and not deleted. Review and back up any customizations before manual removal.
```

---

## 5. Recommended Operator Upgrade Workflow

1. **Back up customizations**: Copy any locally modified files in `.claude/`, `.omp/`, `.agents/`, `.codex/`, `.antigravity/`, `.pi/`, `.copilot/`, or project root instructions to an external backup location.
2. **Execute dry-run**:
   ```bash
   evcrate publish --dry-run
   ```
   Verify that all planned changes show expected `create`, `update`, `delete`, or `skip` actions, and confirm there are no `conflict` actions.
3. **Resolve collisions**: If any unmanaged collision is detected (`conflict`), move or rename the offending file.
4. **Apply publication**:
   ```bash
   evcrate publish --apply
   ```
5. **Review leftovers**: Check human warning output or `legacyLeftovers` in JSON. Manually migrate any needed customizations from preserved untracked files into the new `evc-*` resources, then delete the obsolete files.
