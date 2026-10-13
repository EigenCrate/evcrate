# Proposed design contracts

**Status:** Phase 02 contract modules implemented (`src/adapters/vscode/model-intent.ts`, `extensions/vscode-model-bindings/src/contracts.ts`); live native editor qualification deferred to real-case verification (Phase 09) per explicit user gate amendment (2026-10-12). See [interface freeze report](./reports/interface-freeze.md). Reconciled with confirmed [Validation Summary](./plan.md#validation-summary). [Plan](./plan.md), [baseline](./reports/baseline-analysis.md), [API research](./research/native-provider-contract.md), [package research](./research/publication-package-contract.md).

## 1. Scope and invariants

- Deliver private VSIX, immutable converted templates/intent, runtime picker/bindings/actor overrides, one actor provider, effective-binding diagnostics, hashed packaging and consented postpublish installation.
- Canonical tier intent and six other target mappings unchanged. Current `evc-*` naming, `evc` plugin and `cmd-*` skills retained.
- No new inference client, proxy, daemon, controller, provider router or advisor actor. Evaluator repair excluded.
- No hand-editing projections/manifests; no build-time model catalog/network calls; no arbitrary prompt/script substitution.
- Runtime writes exclusively to extension-owned storage. Published roots and canonical bytes never change during configuration/refresh.
- Missing binding, duplicate selector, unsafe source or unknown schema never downgrades silently.
- Required qualification and support are limited to local contexts only: project/HOME coexistence, multi-root and profiles. SSH, dev-container and WSL are excluded from this deliverable without changing unrelated baseline support. Unavailable or infeasible required local rows block acceptance; changing support/scope requires explicit user approval.

## 2. Proposed file and package ownership

| Surface | Owner / proposed path | Rule |
|---|---|---|
| Canonical intent | `.evcrate/source/.claude/agents/evc-*.md` | Existing authoring, unchanged tiers |
| Projection helpers | `src/adapters/vscode/` | Reuse current conversion/parser/name/reference conventions |
| Immutable templates | `.evcrate-vscode/evcrate/agent-templates/evc-*.md` | Outside host-discovered agent directories; no actionable model pin |
| Intent inventory | `.evcrate-vscode/evcrate/agent-intent.json` | Versioned strict records, canonical ID/tier, path/hash, existing restrictions/reference provenance |
| Companion source | `extensions/vscode-model-bindings/` (new) | Separate extension TS compile/entry closure; pinned API declarations |
| Packaged companion | `.evcrate-vscode/evcrate/companion/evcrate-model-bindings-<version>.vsix` | Inert hashed harness artifact; never autoexecuted by publication |
| Companion descriptor | `.evcrate-vscode/evcrate/companion/package.json` (data descriptor, not executable package entry) | Version, extension ID/build identity, VSIX relative path/SHA-256, supported host/API tuple, intent schema |
| Derived resources | `ExtensionContext.storageUri` or partitioned `globalStorageUri` / `resolved/<root-identity>/<instance-uuid>/<generation>/` | Local same-host URI, profile/root/window isolated instance namespace; never published roots |
| Bindings | Extension `globalState` defaults + root-scoped `workspaceState` overrides | Unsynced user-owned extension state; no `.vscode/settings.json` writes |

Proposed extension ID: `eigencrate.evcrate-model-bindings`; match descriptor/VSIX/CLI/launch instructions exactly in Phase 02. No Marketplace publication. Authoring paths above are planned additions, not existing modules.

Build intent schema: `evcrate-vscode-agent-intent-v1`. Build tool audit advances to v2: canonical intent + template disposition; no historical `nativeModel`/"pinned" claims. Remove old `model-map.json` and obsolete public mapping/resolver exports in a clean caller migration. Runtime diagnostics use `evcrate-vscode-runtime-bindings-v1`; they never overwrite build audit.

## 3. Root selection, trust and precedence

1. Enrollment is an explicit extension command. Offer exact local workspace-folder `.evcrate-vscode` roots and an explicit local HOME/custom installed root. Do not search ancestors or execute root-provided JS to discover metadata.
2. Validate local same-host URI/authority, containment, schema, inventory hashes and bounded regular files before contribution. Hashes establish integrity/coherence, not signer trust; require normal workspace trust and user root approval.
3. In a single-folder window, approved valid project installation takes precedence over approved HOME. A present but unsafe/incompatible project installation is an error, never silently replaced by HOME. No root contents merge.
4. In multi-root, bind the chat window explicitly to one installation/folder when multiple project roots exist. If the pinned provider context exposes documented reliable folder identity, Phase 01 may establish per-context routing instead; never use arbitrary object fields or first-folder order. Switching selected root refreshes provider inventory with unchanged `evc-*` actor names (subject to the cached-selection reselection/reload rule in §6).
5. Root identity includes normalized scheme/authority/canonical path, with isolated storage across local profiles, roots and windows. Non-local/remote authorities (SSH, dev-container, WSL) are unsupported in this deliverable and fail closed with explicit unsupported-context guidance—never silently falling back to local HOME, local editor storage, or interpreting local paths on a remote authority.
6. Workspace trust revoked, source removed or schema/hash invalid: withdraw affected inventory, retain bindings, show setup reason. An invalid project does not change policy to a different HOME inventory.
7. Extension runs on the qualified local extension host so concrete resource and hook paths share local authority. Unsupported remote/virtual contexts are refused without silent local fallback; dual local/remote registration is prohibited. Exact `extensionKind`, file URI handling and local profile/storage support freeze after Phase 01.

## 4. Binding state and model selector

Proposed stored schema `evcrate-vscode-bindings-v1`:

```json
{
  "schema": "evcrate-vscode-bindings-v1",
  "revision": 1,
  "tiers": { "opus": { "vendor": "copilot", "id": "<user-selected opaque ID>" } },
  "actors": { "evc-planner": { "kind": "model", "vendor": "copilot", "id": "<user-selected opaque ID>" } }
}
```

Example only, not default/fallback. `sonnet`/`haiku` follow the same shape. Actor entries may be `{ "kind": "inherit" }` only after deliberate actor-specific choice; removing an actor entry restores canonical intent.

- Preserve actor specificity across scopes: root actor override > user-default actor override > root tier binding > user-default tier binding (canonical `inherit`/omitted model unless an explicit actor choice is present). Resolve root override/default layers per key: root actors override user actors, root tiers override user tiers; absent root key uses corresponding user key. Do not let a root tier erase an explicit user actor override.
- Canonical `inherit`/omitted model bypasses tier lookup and omits `model`, unless an explicit actor choice is present.
- Canonical pinned tier requires an exact selected `(vendor,id)` unless explicitly actor-overridden. Missing tier only withholds actors needing that tier, not unrelated valid/inherit actors.
- Resolve identity against current catalog; render `name (vendor)` using pinned native matcher semantics. Never put opaque API IDs or Claude aliases in ordinary derived frontmatter.
- Validate emitted selector uniquely addresses that catalog identity. Equal vendor/name for different IDs is ambiguous and unusable; show alternatives, never select first result. Revalidate after catalog rename/version changes.
- No family ranking/version heuristics, fallback arrays or automatic replacement of removed IDs. Premium/cost/agent-capability restrictions are host-owned and exercised natively.
- Initial catalog discovery is user-initiated. Refresh after `lm.onDidChangeChatModels` once configured; handle empty/rejected discovery without inference. Do not assert catalog queries always require consent.
- UI commands: `evcrate.configureAgentModels`, `evcrate.configureActorModel`, `evcrate.selectInstallation`, `evcrate.showModelBindings`, `evcrate.clearModelBindings`. Quick Pick/InputBox only; no new webview/harness.
- Root selection and binding edits persist only after confirmation; cancellation leaves revision and resources unchanged. Reset exact selected layer/key; never uninstall/delete unrelated state.

## 5. Provider and references

`chat.registerCustomAgentProvider` receives only resource URIs/conditions/session types. Its API is not an interceptor for static agents, and input has no `pluginUri` attribution override.

- On final cutover plugin emits templates, not actors in `com.github.copilot/agents`. Companion is sole `evc-*` actor owner. Installation/proposal disabled means actors unavailable with instructions, not old static fallback.
- Use concrete versioned `.agent.md` files, registered only after complete validated generation. Preserve name/description/body, tools omitted vs `[]`, `agents` restrictions, visibility, skills metadata, allowed non-bypass permission semantics.
- Relative links need structured rebasing from template origin to published supporting resources; use existing reference transformation conventions. Preserve literal external URLs, command tokens, `${PLUGIN_ROOT}` meaning and protected prose/scripts. No global string rewrite.
- Plugin continues owning hooks/skills/workflows/instructions/runtime scripts. Provider source attribution may break plugin-local hooks or namespaced skill context; Phase 01 must prove equivalence or stop. No invented pluginUri property or duplicate hook providers.
- Deactivate disposes watchers/events/provider without modifying published files or removing bindings. Provider-disabled states remain diagnostically distinct from installed/activated states.

## 6. Refresh and lifecycle

Inputs: configured binding revision, catalog snapshot/revision, template inventory hashes, selected root/trust, supported host tuple. Reconcile on state edits, catalog event, scoped source watcher and workspace changes.

- One single-flight refresh; coalesce events (200 ms proposed debounce), discard superseded async results by revision, honor cancellation, no polling/retry daemon.
- Stage a complete generation, validate all bytes/references, then publish its provider list and change event. No partially written files ever become discoverable.
- Catalog/root invalidation withdraws affected current records immediately; a stale async result cannot republish them. Never waive workspace trust/source invalidation, tools/delegation restrictions or hooks.
- Keep already-issued concrete generations immutable for running turns. Distinguish newly discovered, refreshed or explicitly reselected resources from cached chat selections: emitting a provider refresh/change event updates contributed current-generation inventory, not an already-selected cached chat agent, so do not promise unconditional next/future invocation refresh of a cached selection or claim provider withdrawal can intercept cached selections or explicit tool model arguments. Document the cached-agent limitation—including possible unintended-model execution until explicit reselection or window/session reload—and prove both native race behavior and recovery after explicit reselection/reload. Newly discovered, refreshed or reselected resources (a newly selected/reselected actor from the current refreshed generation, or a qualified reload recovery—never a provider change event alone) must use the intended model; wrong model after refresh/reselection/reload fails acceptance.
- Generation ownership includes unique window/extension-host instance UUIDs under local authority/profile/root storage. One instance never deletes another's files. Proposed <=32 generations/64 MiB active-instance budget and <=256 MiB persistent authority-store budget remain subject to Phase 01 feasibility measurements and require bounded shared accounting before allocation; exhaustion blocks new derivation with guidance, never deleting possibly referenced resources. Host restart or closing windows alone is not proof that a restored chat session no longer references an old URI. Bounded retention and safe fully closed-editor manual cleanup (requiring all editor windows closed plus explicit session/reference retirement or Phase 01 proof that reopening cannot reuse deleted generation URIs) are acceptable when safe automatic reclamation is unproven. Test two windows, extension-host restart, restored chat and root switching.
- Source limits proposed: <=32 enrolled roots, <=512 actors/root, <=1 MiB/template, <=16 MiB/generation, <=64 KiB binding JSON, <=2048 catalog entries. Overflow produces diagnostic and no truncated valid-looking snapshot.
- Diagnostics: actor canonical tier, root/authority, selected identity, exact rendered selector, override layer, template/binding/catalog revision, contributed/withheld reason. Label rendered selection separately from actual host-observed selection. No prompts, credentials, inferred tokens or hidden reasoning logs.

## 7. Build/VSIX closure

- Pin package/compiler/VSIX tooling and proposed declarations in lockfile. Extension uses only `vscode` external plus Node builtins or explicit bundled dependency closure; CLI runtime closure remains unchanged.
- Build extension once before distribution input snapshot; package offline from locked inputs. Prefer deterministic normalized ZIP timestamps/order; bind actual bytes by hash regardless. Build must fail when staged VSIX source/package/version is stale.
- Generate the prebuilt VSIX/descriptor under `.evcrate/targets/vscode/files/evcrate/companion/` before snapshot and declare existing schema-2 `overlay_root` for this target. The targets tree is already copied/hashed by `prepareInputSnapshot`; consume only its snapshotted overlay. Add bounded artifact merge/expectation handling to target staging and both serial/worker paths before validation, rather than giving the adapter a live package-root escape. Hash/validate the extension source receipt before snapshot and recheck at promotion so stale package bytes fail. No new target/build/publication schema or network projection step.
- Development receipt inputs enumerate every extension source/import closure, extension package/tsconfig/proposed declarations, shared intent/frontmatter/reference helpers, root package/lockfile, generator/verifier and pinned tool/version identities; missing or changed inputs fail, and captured hashes recheck at promotion. Packed consumers use an explicitly validated package-layout mode (never infer it from missing development sources): verify embedded source/closure identity, VSIX/descriptor against verified BuildManifest and package inventory, without claiming checkout-source freshness. Missing required artifact/receipt fails. Phase 02 freezes producer and consumer verifier entry contracts; Phase 07 proves each. Live overlay mutation after snapshot must fail freshness or leave consumption entirely within the valid snapshot.
- VSIX/package descriptor and templates are in target output hashes, package inventory and both platform archives. Existing seven external release assets and release metadata v2 stay unchanged.
- Verify ZIP entries, expected extension ID/version/API declarations, embedded build identity, no traversal/symlinks, closed runtime contents, and byte digest. Build identity derives from the closed source/compiled-content receipt without self-reference; same private release version may not be republished with different identity. Local development rebuilds with same version require actual installed identity inspection, never version-only acceptance.

## 8. CLI postpublish install contract

Proposed flags: `--install-vscode-companion`, `--no-install-vscode-companion`, `--vscode-editor <absolute executable>`, `--vscode-profile <exact name>`. Freeze collision/operation/request-file rules with existing arguments parser.

- Require VS Code selected and actual committed publication; no build/check/preview/recover hook. Default-No interactive offer only in TTY/non-CI/non-JSON. Explicit positive flag is installation consent in non-TTY/JSON; reject contradictory flags before mutation.
- Display verified extension/version, VSIX path/hash, local editor executable/profile and local target. Missing, ambiguous or non-local target stops with actionable setup; never guess all profiles/authorities or silently fall back to local HOME/default editor state.
- Reuse bounded process runner, argv array, cancellation, proposed 120s install deadline and <=1 MiB per output stream. No shell interpolation or `--force`.
- Already installed exact version AND qualified build identity: preserve enabled/disabled state, no reinstall. Matching version without verified identity yields `manual-setup-required` / identity-unverified, not exact-candidate success. Disabled/unknown state never auto-enables; use supported user UI confirmation/operation and recheck, or leave setup pending. Installation cannot grant trust or proposal permission.
- Prevent published-path replacement during installer consumption: open/copy the validated regular VSIX into a private no-symlink install stage, hash and inspect that staged copy against the committed descriptor, and pass only the staged path to the editor. Retain the private stage until the bounded installer process is confirmed finished/canceled; clean only this instance's stage. Never install directly from a publication path that concurrent republish can replace.
- Keep existing `--register-vscode-settings` independent. Installation refusal must not undo publication or an independently authorized registration.
- Proposed APIs: print explicit private launch `--enable-proposed-api=eigencrate.evcrate-model-bindings`. No automatic `argv.json` mutation/restart; persistent enablement requires separate future authorization.
- Keep ResourceResult stdout unchanged. Additional stderr line is bounded JSON in machine mode: schema `evcrate-vscode-companion-install-v1`, publication `committed`, status `installed|already-installed|skipped|declined|manual-setup-required|failed`, editor/profile, reason; sanitize outputs. TTY human equivalent. Explicitly requested installation that ends in `failed` or `manual-setup-required` returns exit 5 while committed core stdout remains true and stderr reports companion status; implicit offer failure warns without rewriting core result, and implicit declined/skipped offers leave publication exit success. No rollback claim or blind publication retry.
- CLI installation is scoped to local editor/profile tuples only; SSH, dev-container and WSL are excluded from this deliverable. Unsupported or unsafe CLI targeting reports `manual-setup-required` (exit 5 when explicitly requested), never local success or silent local fallback. Manual instructions do not satisfy automatic-install acceptance for a required local profile tuple; the gate stays blocked unless native proof or explicit user-approved support/design change resolves it.

## 9. Acceptance and rollback

[Verification matrix](./verification-matrix.md) traces all eleven brainstorm acceptance requirements to phases and proof. Automated behavior tests cover uncertain boundaries; native editor smoke proves discovery/selection/hooks/refresh. Historical rows do not qualify new candidate bytes.
Newly discovered, refreshed or explicitly reselected invocations (from the current refreshed generation or after qualified reload recovery, not a provider change event alone) executing an unintended model fail acceptance. Cached agent selections held across config/catalog/template updates have a narrow documented limitation (possible unintended-model execution until explicit reselection or window/session reload), but native race observation, explicit user warning/guidance and recovery proof after reselection/reload remain required, and workspace trust/source invalidation, tools/delegation restrictions and hooks are never waived. Provider attribution, local project/HOME/multi-root/profile isolation and disabled-state preservation remain hard native gates. Phase 10 generated-guide changes invalidate prior candidate digests and require new manifests/package identities plus affected native qualification; maintained prose-only doc edits may retain unchanged artifact identities.

Before any live model qualification in any phase (including Phases 01 and 09), each session requires prior explicit user approval naming the exact isolated profile/workspace, selected models and invocation scope; changes require renewed approval. Session approval is separate from and does not grant extension installation or proposed-API enablement consent.

If feasibility fails before cutover, existing static output remains untouched. After cutover, rollback means explicitly install/re-publish a prior qualified package and separately restore the prior companion version through consented editor operation. Do not regenerate old aliases as a runtime fallback; do not delete bindings, force uninstall, or use harness recovery to repair extension installation.

## Unresolved questions

Phase 01 must settle local plugin hook attribution, cross-origin references/skills, selector ambiguity, observed cached-selection race and reselection/reload recovery behavior, measured generation retention/cleanup, and local profile/multi-root/disabled-state boundaries after prior per-session live-invocation approval. No architecture approval can substitute for those native observations.
