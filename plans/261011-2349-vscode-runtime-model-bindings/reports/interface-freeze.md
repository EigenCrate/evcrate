# Phase 02 Interface Contract & Ownership Report

**Status:** Contract schemas implemented for Phase 03–08 development (**NOT FROZEN FOR RELEASE — live native qualification deferred to real-case verification per explicit user gate amendment on 2026-10-12**).

## 1. Gate Amendment & Qualification Boundary

- **Phase 01 Offline Evidence:** 10/10 offline checks passed against pinned declarations for VS Code `1.140.0` (`07f806f999227108933c2e30515b26eecc1fda74`) and Copilot Chat `0.68.0` ([native-feasibility.md](./native-feasibility.md), [support-matrix.md](./support-matrix.md)).
- **User Gate Amendment (2026-10-12):** User explicitly authorized bypassing live editor checks during Phase 01 to continue with Phase 02 contract implementation, deferring live native editor execution checks until real-case end-to-end verification (Phase 09).
- **Assumptions Requiring Live Native Proof Before Final Release Qualification:**
  1. Cross-source plugin hook attribution (`local-hook-bridge.cjs`) and relative reference/skill resolution for extension-attributed custom agents.
  2. Live host selector matching (`name (vendor)`), child subagent model inheritance, and explicit tool-model/cost precedence.
  3. Observed cached-selection race behavior when a selected agent is rebound or removed mid-session, and recovery via explicit agent reselection or window reload.
  4. Live multi-window / restored-chat URI retention behavior to calibrate the provisional storage budgets below.
  5. Profile disabled-state preservation and installed build-identity inspection during CLI post-publish companion installation.

This contract implementation authorizes neither extension installation, `--enable-proposed-api` persistent mutation, nor live model inference.

## 2. Extension Identity & Pinned Host Tuple

| Field | Value | Rule |
|---|---|---|
| Extension ID | `eigencrate.evcrate-model-bindings` | Exact match across `extensions/vscode-model-bindings/package.json`, descriptor, CLI, and launch flag |
| Package version | `2.11.0` | Synchronized with root `package.json` |
| Pinned VS Code engine | `1.140.0` (`07f806f999227108933c2e30515b26eecc1fda74`) | Exact engine pin; no broad semver range |
| Pinned Copilot Chat | `0.68.0` | Coupled with pinned host tuple |
| Enabled API proposals | `["chatPromptFiles"]` | Launch requires `--enable-proposed-api=eigencrate.evcrate-model-bindings` |
| `extensionKind` | `["workspace"]` | Local extension host only; no dual local/remote registration |
| Activation events | `onStartupFinished` + 5 `onCommand:evcrate.*` | Guarded activation; fails closed on unsupported remote authorities |

## 3. Contract Schemas & Error Codes

### 3.1 Build Intent Inventory (`evcrate-vscode-agent-intent-v1`)
- Path: `.evcrate-vscode/evcrate/agent-intent.json`
- Producer: `src/adapters/vscode/agents.ts` (Phase 03) using `src/adapters/vscode/model-intent.ts`
- Consumer: `extensions/vscode-model-bindings/` loader (Phase 04)
- Fields:
  - `schema`: `"evcrate-vscode-agent-intent-v1"`
  - `pluginName`: `"evc"`
  - `actors`: map of canonical `evc-*` actor IDs (`1..512`) to `{ actorId, sourcePath, templatePath, templateSha256, referenceBase: "agents", intent, tools, delegation, visibility }`.
  - `intent`: `{ mode: "inherit", tier: null }` or `{ mode: "tier", tier: "opus" | "sonnet" | "haiku" }`. Concrete model versions (e.g. `claude-3-opus`) and legacy `evcrate-vscode-model-map-v1` are rejected (`SCHEMA_UNSUPPORTED` / `CONTRACT_INVALID`).

### 3.2 Build Tool Audit v2 (`evcrate-vscode-agent-tool-audit-v2`)
- Path: `.evcrate-vscode/evcrate/agent-tool-audit.json`
- Replaces v1 `model.nativeModel` / `"pinned"` claims with `modelIntent: { source?, tier: "opus" | "sonnet" | "haiku" | null, disposition: "tier-required" | "inherit" }` and `templateSha256`.

### 3.3 Stored User/Root Bindings (`evcrate-vscode-bindings-v1`)
- Storage: Extension `globalState` (user defaults) and installation-scoped `workspaceState` (root overrides); max `64 KiB` (`65,536` bytes).
- Fields: `schema: "evcrate-vscode-bindings-v1"`, `revision: integer >= 1`, `tiers: Partial<Record<"opus" | "sonnet" | "haiku", { vendor, id }>>`, `actors: Record<actorId, { kind: "inherit" } | { kind: "model", vendor, id }>`.

### 3.4 Runtime Diagnostics (`evcrate-vscode-runtime-bindings-v1`)
- Fields: `schema`, `rootIdentity`, `authority` (`"local-file" | "unsupported-remote"`), `instanceUuid`, `bindingRevision`, `catalogRevision`, `templateInventorySha256`, `cachedSelectionNotice`, and per-actor `{ actorId, canonicalTier, effectiveSource, selectedModel, renderedSelector, hostObservedModel, status, reason? }`.
- `renderedSelector` and `hostObservedModel` are strictly separate fields; `hostObservedModel` is `null` unless populated from actual native invocation metadata.

### 3.5 Companion Descriptor & Source Receipt
- Descriptor (`evcrate-vscode-companion-descriptor-v1` at `.evcrate-vscode/evcrate/companion/package.json`): binds `extensionId`, `version`, `buildIdentity`, `vsixRelativePath`, `vsixSha256`, `supportedHost`, and `intentSchema`.
- Source receipt (`evcrate-vscode-companion-source-receipt-v1`): binds `buildIdentity`, non-self-referential checkout input digests (`inputs`), and `toolIdentities`. Release candidate `buildIdentity` is immutable per version (`BUILD_IDENTITY_IMMUTABLE_VIOLATION`).
- Layout verifier (`verifyCompanionLayoutContract`): requires explicit `mode: "development-checkout" | "packed-package"`, never inferring packed mode from missing checkout files.

### 3.6 CLI Post-Publish Companion Install Notice (`evcrate-vscode-companion-install-v1`)
- Flags: `--install-vscode-companion`, `--no-install-vscode-companion`, `--vscode-editor <abs-path>`, `--vscode-profile <name>`.
- Eligible operations: `publish --apply`, `publish --dry-run` (validation only), `distribute publish`, `distribute all`, `request-file`.
- Process bounds: `120,000 ms` deadline, `1 MiB` per output stream, private staged VSIX copy verified before launch.
- Exit code rule: When explicitly requested (`requested: true`) and post-commit status is `"failed"` or `"manual-setup-required"`, CLI returns exit code `5` while preserving committed `ResourceResult` on stdout and emitting `evcrate-vscode-companion-install-v1` on stderr.

## 4. Precedence, Authority & Storage Bounds

1. **URI & Authority Allowlist (`validateLocalRootUri`):** Only `file://` URIs with empty/localhost authority and normalized absolute paths without `..`, `\`, `\0`, query, or fragment are accepted. Remote schemes (`vscode-remote://`, `wsl://`, `ssh-remote`, `dev-container`) throw `UNSUPPORTED_REMOTE_AUTHORITY` without falling back to local HOME.
2. **Installation Root Precedence (`resolveInstallationRoot`):**
   - Single-folder: valid approved project `.evcrate-vscode` > valid approved HOME `~/.evcrate-vscode`. If project `.evcrate-vscode` is present on disk but invalid, unapproved, or in an untrusted workspace, throws `PROJECT_INSTALLATION_INVALID` / `WORKSPACE_UNTRUSTED` and never falls back to HOME.
   - Multi-root: requires explicit window selection (`explicitSelectedRootIdentity`) when multiple project roots exist (`MULTI_ROOT_SELECTION_REQUIRED`); never uses folder index `0`.
3. **Cross-Scope Binding Resolution (`resolveEffectiveActorBinding`):**
   - `root.actor` > `user.actor` > `canonical.inherit` (omits `model`, bypasses tier lookup) > `root.tier` > `user.tier` > `unresolved` (`TIER_UNBOUND`).
   - Explicit actor `{ kind: "inherit" }` omits `model`; clearing a root override reveals the user-default layer or canonical intent.
   - Selector `<name> (<vendor>)` must uniquely identify one catalog `(vendor, id)`. Missing model returns `MODEL_NOT_FOUND`; duplicate `(vendor, name)` across distinct IDs returns `SELECTOR_AMBIGUOUS`.
4. **Storage Namespace & Provisional Budgets (`STORAGE_AND_SOURCE_BOUNDS`):**
   - Path: `resolved/<rootIdentitySha256>/<instanceUuid>/gen-<generationId>`.
   - Caps: `<=32` enrolled roots, `<=512` actors/root, `<=1 MiB`/template, `<=16 MiB`/generation, `<=64 KiB` bindings JSON, `<=2048` catalog entries, `<=32` active generations / `<=64 MiB` per instance, `<=256 MiB` persistent authority store, `200 ms` refresh debounce.
   - Exhaustion returns `STORAGE_BUDGET_EXCEEDED` with `requiresClosedEditorManualCleanup: true` without deleting existing generations. Cross-instance deletion is forbidden; manual cleanup requires all editor windows closed and referencing sessions retired.

## 5. Module Ownership Boundaries for Phases 03–08

| Phase | Owned Files | Boundary Rule |
|---|---|---|
| Phase 02 | `src/adapters/vscode/{model-intent.ts,companion-package-contracts.ts,companion-cli-contracts.ts}`, `extensions/vscode-model-bindings/{package.json,tsconfig.json,vscode.proposed.chatPromptFiles.d.ts,src/runtime-contracts.ts,src/diagnostics-contracts.ts,src/contracts.ts}` | Pure contracts and compilation only; existing static projection untouched |
| Phase 03 | `src/adapters/vscode/{agents.ts,adapter.ts,names.ts,inventory.ts,catalogs.ts,metadata.ts,index.ts,configuration*.ts}` (retire `models.ts`) | Consumes `model-intent.ts`; removes static agent registrations and `model-map.json` |
| Phase 04–06 | `extensions/vscode-model-bindings/src/{extension.ts,installation-roots.ts,agent-provider.ts,agent-renderer.ts,resource-storage.ts,model-catalog.ts,binding-store.ts,binding-resolver.ts,configuration-commands.ts,refresh-controller.ts,diagnostics.ts}` | Consumes `extensions/vscode-model-bindings/src/contracts.ts`; never imports core CLI |
| Phase 07 | `package.json` (`build:vscode-companion`, `check:vscode-companion`), `scripts/{build-vscode-companion.mjs,verify-vscode-companion.mjs}`, `.evcrate/targets/vscode/manifest.json`, `src/distribution/*` | Uses `companion-package-contracts.ts` and `companion-cli-contracts.ts`; wires extension compile/test scripts per `verification-matrix.md:36` |
| Phase 08 | `src/cli/{arguments.ts,types.ts,dispatch.ts,vscode-companion-installation.ts,vscode-companion-prompt.ts}` | Uses `companion-cli-contracts.ts` |
## Unresolved Questions

- Live native editor verification of cross-source hook attachment, live model selector emission, cached-selection race/reselection recovery, and live generation storage retention remains deferred to real-case verification (Phase 09) per user gate amendment.
