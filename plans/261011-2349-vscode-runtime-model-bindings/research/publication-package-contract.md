# Publication/package integration research

Read-only scout completed; parent reconciled recommendations with current maintained contracts. No checks or implementation.

**Confirmed output/scope:** The [Validation Summary](../plan.md#validation-summary) fixes exit 5 for explicitly requested installation ending in `failed` or `manual-setup-required`, with committed publication stdout, separate companion-status stderr and no rollback or blind publication retry. Qualification is local project/HOME, multi-root and profiles only; references below to avoiding remote side effects are safety constraints, not remote support claims. Native checks remain NOT RUN.

## Adapter owners

- `src/adapters/vscode/adapter.ts`: projection assembly and `plugin.json` (`evc`); writes `evcrate/model-map.json`.
- `models.ts`: `VSCODE_LOCAL_MODEL_MAP`, `resolveLocalModel`, `buildVscodeModelMap`; `metadata.ts` and `index.ts` expose them. `agents.ts` uses the resolver; `adapter.ts` uses model-map builder.
- `names.ts`, `inventory.ts`, `catalogs.ts`, `references.ts`: name/path/disposition/reference consumers. `hooks.ts` owns `${PLUGIN_ROOT}/evcrate/runtime/local-hook-bridge.cjs` plus supporting closure.
- Existing affected suites: `tests/adapters/vscode-configuration.test.mjs`, `vscode-resource-projection.test.mjs`, `vscode-behavior.test.mjs`, `vscode-reference-closure.test.mjs`.
- Before removing exported symbols in implementation, use available LSP references. Search inventory alone is not an exhaustive symbol-reference proof.

## Publication boundary

- `.evcrate/targets/vscode/manifest.json` declares output root `.evcrate-vscode`, binding `.evcrate-vscode`, preserved `.evcrate.json`, compiled adapter input closure.
- `src/distribution/build-resolution.ts`, `output-paths.ts`, `publication-plan.ts` own verified output hashes and materialization.
- VSIX can be inert hashed target data within `.evcrate-vscode/evcrate/companion/`. Installation remains outside core transaction. Artifact placement does not imply execution/installation authority.
- Do not add legacy manifest `runtime`/`advisor_runtime`, new HOME binding, journal phase, or target ID.

## Existing post-action precedent

- `src/cli/dispatch.ts` calls `coordinateVscodeSettingsRegistration` after core dispatch.
- `src/cli/vscode-settings-registration.ts` gates committed VS Code publication; skip/default prompt/explicit flags live here.
- `src/distribution/vscode-settings.ts` preserves JSONC and existing disabled entries unless explicitly authorized. It changes `chat.pluginLocations`, not extension enablement/proposed API permissions.
- `src/cli/process-runner.ts` supplies bounded process execution. Reuse it; no shell-interpolated `code` command.
- `tests/cli/vscode-settings-registration.test.mjs`, `tests/distribution/vscode-settings.test.mjs`, `tests/cli/dispatch.test.mjs` are post-action/consent regression seams.

## Release constraints

- `package.json#files` already includes `.evcrate/source/.evcrate-vscode/**`.
- `scripts/release/runtime-closure.cjs` validates CLI/public TS entry closures; VSIX extension runtime needs its own bounded closure/ZIP content verification.
- `scripts/release/pack-inventory.cjs` hashes packed files and seven target manifest digests. VSIX must be in target output hashes and package inventory.
- `scripts/prepare-release-assets.cjs`, `scripts/release/asset-verification.cjs`, `run-release-candidate.cjs`, `metadata-schema.cjs`, `semantic-release-asset-prepare.cjs` preserve exact seven external core release assets.
- Embed VSIX inside existing Linux/Windows archives via package inventory, not as an eighth external asset or new release metadata field.
- Current runtime/release metadata is controller-free per maintained architecture. Historical controller hash claims in scout prose are stale, not a design input.
- `tests/distribution/private-release-artifacts.test.mjs`, `release-orchestration.test.mjs`, `release-and-cutover.test.mjs` and `tests/integration/vscode-installed-runtime.test.mjs` cover relevant package/install/runtime seams.

## Output decision

Keep exact core `ResourceResult` JSON stdout untouched. Installer gets a separate bounded structured stderr notice and explicit failure exit-code override, modeled after settings registration. Example semantics: core stdout says publication committed; stderr says companion installed/skipped/failed. No fabricated rollback, no new top-level resource-result fields. TTY uses readable equivalents. Machine status schema frozen in Phase 02.

## Unresolved questions

Exact disabled-extension/profile inspection may not be available through `code --list-extensions`; never equate installed with enabled. Phase 01 must prove a safe explicit flow; installer must avoid `--force`, silent enablement and remote/all-profile side effects. Exact packaging reproducibility/closure inputs freeze before implementation.
