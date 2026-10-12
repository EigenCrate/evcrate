# Code Review Cycle 2 — Phase 04 Companion provider runtime

Score: **5/10**. Cycle-1 criticals 1-3 fixed + renderer/d.ts warnings fixed; critical 4 (root approval/containment) still open; new critical: manifest `templatePath` traversal/unverified hash in extension.ts. Typecheck + 12/12 tests green.

## Cycle-1 status
| # | Item | Status |
|---|------|--------|
| C1 | extension.ts wiring | FIXED (resolve -> read -> render -> stage -> updateInventory; trust/folder events). Gaps below (W1-W3) |
| C2 | stage traversal | FIXED (ACTOR_ID_PATTERN + dup + <=512 in renderer & stager; tests for `../../../escape`) |
| C3 | HOME layout | FIXED (probe: parent-style + `~/.evcrate-vscode` both resolve, pluginFsPath correct) |
| C4 | root approval/containment | **NOT FIXED** (see Critical 1) |
| W1 renderer `model` strip | FIXED (probe: `metadata.model` kept; `model: |` + continuation removed) |
| W2 code fence rewrite | FIXED for fenced code; inline-backtick/prose rewrite remains (plan says structured refs only) |
| W3 stager atomicity | PARTLY: mkdtemp, fail-if-exists, size verify done. No fsync/reference-target verify; old generations never cleaned |
| W4 extension.ts DRY/state | PARTLY: guard now computed once; module-level state remains; provider double-disposed |
| W5 URI vs fsPath | unchanged (Linux-only OK) |
| W6 `Thenable` | FIXED (declared in d.ts) |
| W7 tests | PARTLY: traversal + HOME + renderer tests added; none for extension.ts, approval, templatePath |

## Critical
1. **Root approval still bypassed.** `extension.ts` calls `resolveCandidateRoots` without `approvedRoots`; `isApproved` returns `true` when undefined; `inspectCandidateRoot(..., approved = true)` default. Any workspace `evcrate/` or `.evcrate-vscode/` dir auto-contributes agents. No enrollment state/UI, no realpath/symlink containment of root path. Contradicts phase Security ("explicit root approval required"), Step 2 enrollment. Probe: project w/ `evcrate/{agent-intent.json,agent-templates}` resolved without approval; `approvedRoots: new Set()` correctly rejects -> only wiring missing (globalState keyed by rootIdentity + approve command). Fix: persist approved set in `context.globalState`, pass in, default `approved=false`, and make `evcrate.selectInstallation` prompt with exact root preview.
2. **`templatePath` unvalidated + hash optional (extension.ts:52-57).** `join(pluginFsPath, actor.templatePath)` — manifest `../../..` reads arbitrary file, `if (actor.templateSha256 && digest!==...)` skips integrity when hash absent, then content staged as agent file (arbitrary local-file exfil into prompt of an agent; renderer requires YAML frontmatter, limits impact but not to zero for md/yaml files). Manifest not validated through frozen parser (`validateAgentIntentManifest` in `src/adapters/vscode/model-intent.ts` enforces `TEMPLATE_AGENT_PATH`, SHA-256 required, exact keys). Also `readFileSync` follows symlinks, no size bound before read (`maxTemplateBytes`) and no manifest size bound. Fix: port/share validator (leaf, extension closure), require hash, lstat regular-file + size check + realpath containment under `<plugin>/evcrate/agent-templates`.

## Warnings
1. Every refresh stages a new generation even when content unchanged -> new URIs -> `updateInventory` always fires change event; old gens never deleted; `activeInstanceBytesTotal`/count only grow -> after budget silently withdraws all actors (generic `catch`). Dedupe via `templateInventorySha256` before staging; reuse current generation.
2. `persistentAuthorityBytes: activeInstanceBytesTotal` mislabels a different quantity (budget semantics wrong).
3. One bad actor aborts whole generation: `renderAgentTemplate` throw inside loop hits outer catch -> withdraw all. Plan: invalid actors omitted w/ reason, others stay. Missing template/hash mismatch use `continue` silently (no reason, no diagnostics).
4. All failures swallowed (`catch {}`) -> user sees nothing; no setup/diagnostic state ("honest setup state" success criterion). Commands `configureAgentModels`/`configureActorModel`/`clearModelBindings` still info-message stubs (OK if Phase 05, but `clearModelBindings` text claims reset — misleading).
5. Unqualified guard: provider still registered (empty) — fine, but no re-evaluation on trust *revocation* (VS Code restarts ext on revoke; ok) and no notice. Concurrent `void refreshActiveGeneration` calls (trust + folders + command) can interleave; later-finishing older run can overwrite inventory. Serialize/queue.
6. Project root accepts bare `<folder>/evcrate/agent-intent.json` as plugin root (direct layout) — any repo with `evcrate/` dir qualifies; combined with Critical 1 widens attack surface. Restrict project layout to `.evcrate-vscode/`; direct layout for HOME only (or by explicit approval).
7. `resolveCandidateRoots` HOME existence/`inspectCandidateRoot` use `existsSync` (follows symlinks) before `lstat`; TOCTOU between inspect and extension read.
8. Renderer still rewrites inline `` `./.evcrate-vscode/..` `` and prose refs; unquoted paths with spaces unsafe. Verified code fences preserved.
9. `main: ./dist/extension.js` vs tsc `outDir .cache/.../vscode-model-bindings-dist` mismatch; `tests/vscode-companion` not in `package.json` scripts (Phase 07 scope? confirm).
10. Phase todo list unchecked; step 9 real-host smoke not done (acceptable only if documented as pending).

## Suggestions
- `ProviderEventEmitter` wrapper redundant; pass `vscode.EventEmitter` directly. `isDisposed`/`currentResources` test/UI surface only.
- `updateInventory` key compare: compare arrays directly; `Object.freeze` inconsistent with withdraw.
- Remove unused imports in extension.ts (`HostGuardStatus`, double `context.subscriptions` push for provider + registration).
- `Object.entries<any>` -> typed manifest after validator reuse.
- Tests: add extension.ts activation test with a thin vscode stub (not API-forwarding mock) OR extract `refreshActiveGeneration` pipeline into `generation-loader.ts` (testable, extension.ts at 149 LOC will grow).
- `runtime-contracts.ts` 198 LOC: split `validateLocalRootUri`/selection into leaf before Phase 05.

## Positives
- Host guard fail-closed ordering; no local fallback on remote. Renderer selector via `JSON.stringify`; frontmatter strip now structure-aware.
- Stager: mkdtemp staging, fail-if-exists, size verify, budget before write, cleanup on error, root hash in path.
- W-A/W-B/W-C regressions meaningful; `contracts.ts` re-export breaks cycle.
- Provider: single owner, event only on delta, cancellation/disposal handled.

## Files / LOC (all <200)
agent-provider 68, agent-renderer 74, binding-contracts 171, contracts 3, diagnostics-contracts 168, extension 149, installation-roots 145, resource-storage 101, runtime-contracts 198, d.ts 121, contracts.test 191, prerequisites-regressions.test 151, provider-runtime.test 143, storage-and-provider.test 116.

## Validation
- `npx tsc -p extensions/vscode-model-bindings/tsconfig.json` -> exit 0.
- `node --test tests/vscode-companion/*.test.mjs` -> 12/12 pass.
- Probe `/tmp/rv/p.mjs`: HOME resolve OK; project `evcrate/` dir resolves unapproved (no approvedRoots); `approvedRoots=new Set()` -> `PROJECT_INSTALLATION_INVALID`; renderer nested/block model + fence OK.
- Not run: full `npm test`, live VS Code host.

## Unresolved
- Who owns root-approval enrollment UI/state: this phase (Step 2 says yes) or Phase 05? If Phase 05, Phase 04 must default-deny meanwhile.
- Is direct-layout (`<folder>/evcrate/...`) valid for project roots, or HOME-only?
- Should extension closure import frozen `model-intent.ts` validator, or duplicate into extension-local leaf (separate compile closure)?
