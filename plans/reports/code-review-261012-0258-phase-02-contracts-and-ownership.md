# Code Review — Phase 02 Contracts & Ownership (Cycle 2)

## Scope
- Phase: `plans/261011-2349-vscode-runtime-model-bindings/phase-02-contracts-and-ownership.md`
- Focus: verify Cycle 1 W1–W9 / S1–S8 fixes + regression scan of changed files. No code modified; nothing staged/committed.
- Files (LOC): `src/adapters/vscode/model-intent.ts` 194 · `companion-package-contracts.ts` 187 · `companion-cli-contracts.ts` 195 · `extensions/vscode-model-bindings/package.json` 56 · `tsconfig.json` 19 · `vscode.proposed.chatPromptFiles.d.ts` 71 · `src/runtime-contracts.ts` 194 · `src/contracts.ts` 172 · `src/diagnostics-contracts.ts` 146 (new) · `tests/vscode-companion/contracts.test.mjs` 191 · plan docs (phase-02, interface-freeze, design-contracts, verification-matrix).
- `<200 LOC`: PASS all (max 195). Three files within 5-6 lines of cap; any Phase 03/04 growth MUST go in new files.

## Score: 8.5/10 (Cycle 1: 7/10)

All 9 Cycle 1 warnings resolved/accepted with evidence. 0 critical. Remaining: root-identity canonical form is not idempotent (breaks diagnostics round-trip for paths containing `?`, `#`, `%`), plus minor strictness/structure items.

## Cycle 1 Fix Verification (probe-confirmed)
| ID | Status | Evidence |
|---|---|---|
| W1 budget fail-open | FIXED | NaN / negative / float / `newGenerationBytes=0` → `CONTRACT_INVALID`; valid input OK (`runtime-contracts.ts:172-175`) |
| W2 audit v2 strict | FIXED | bad `source` → `PATH_UNSAFE`; extra `modelIntent` key rejected; `tools:{junk}` rejected; entry not aliased, tools/modelIntent frozen (`model-intent.ts:145-194`) |
| W3 nested keys | FIXED | `assertExactKeys` on tools/delegation/visibility/intent; lists bounded ≤128 × ≤256, no NUL/CR/LF |
| W4 diagnostics strict | FIXED | extra key, bad revisions rejected; clone not alias (`r!==input`); per-actor field checks; remote `rootIdentity` rejected (`diagnostics-contracts.ts`) |
| W5 URI normalization | FIXED (+ see W-A) | `%2e%2e`, `%2f`, `%5c`, `%00`, malformed `%` rejected; string vs object form → identical identity; drive-letter case folded |
| W6 trust/HOME | FIXED | untrusted + HOME → `WORKSPACE_UNTRUSTED`; explicit non-present/mismatch → error, no HOME fallback; explicit HOME selection works only with zero project roots |
| W7 parity | FIXED | test now asserts extension ID, host tuple, tiers, `maxActorsPerRoot`, `maxTemplateBytes` core↔extension, plus `activationEvents` |
| W8 wiring | ACCEPTED (deferred) | Phase 07 owns script wiring (`verification-matrix.md:36`, phase-02 Next steps). Test needs manual `tsc -p extensions/…` first; see S-1 |
| W9 doc consistency | FIXED | phase-02 Risk + Unresolved now cite 5 deferred Phase 09 items; consistent with `interface-freeze.md:3-16` |
| S1–S7 | DONE | barrel dropped, `MAX_TEMPLATE_BYTES` now test-referenced, `SAFE_REL_PATH` rejects `./`, trailing `/` (probe), install-notice `version` uses `SEMVER_EXACT`, `activationEvents=["onStartupFinished"]`, `validateBindingsV1` wraps stringify errors (cycle → `CONTRACT_INVALID`) |

## Critical Issues [0]
None.

## Warnings [3]
- **W-A. Root identity not idempotent / not re-parseable** — `extensions/vscode-model-bindings/src/runtime-contracts.ts:72-91`. `rootIdentity` is built from the *decoded* path. Probes: `file:///a/x%3Fy` → `file:///a/x?y` → re-validate throws `PATH_UNSAFE` (query); same for `%23`→`#`; `file:///a/50%2525` → `file:///a/50%25` → re-validates to `file:///a/50%` (different identity); `%0A` yields identity containing a newline (accepted). Impact: `validateRuntimeDiagnosticsV1` re-runs `validateLocalRootUri(rootIdentity)` (`diagnostics-contracts.ts:64`), so diagnostics for a legitimate root containing `?`/`#`/`%` are rejected; identity keyed in storage/approval can drift between producer/consumer. Fix: define identity as canonical re-encoded form (e.g. `encodeURI`-style of decoded segments, or percent-encode `%?#` and control chars), reject decoded control chars (`<0x20`, `0x7F`), and add a `validate(identity)===identity` idempotence assertion in test.
- **W-B. Circular module import** — `extensions/.../src/contracts.ts:6` (`export * from './diagnostics-contracts.js'`) ↔ `diagnostics-contracts.ts:10-17` (imports values `CANONICAL_TIERS`, `EFFECTIVE_SOURCES`, `validateModelIdentity` from `./contracts.js`). Works today only because values are read at call time; fragile under reorder/bundling (esbuild/CJS interop in Phase 07 VSIX). Fix: move shared tiers/sources/identity validator + types into a leaf module (e.g. `binding-contracts.ts`), have `contracts.ts` and diagnostics depend on it; keep `contracts.ts` as barrel only.
- **W-C. Diagnostics unbounded + weak cross-field coherence** — `diagnostics-contracts.ts:93-134`. No actor-count cap (probe: 5000 actors accepted vs `maxActorsPerRoot` 512 / `BOUNDS_EXCEEDED` convention used elsewhere); `status:'contributed'` with `renderedSelector:null` accepted; `status:'withheld'` without `reason` accepted; `cachedSelectionNotice`/`reason` length unbounded. Diagnostics can be attacker-influenced via root data → bound counts/lengths and enforce `contributed ⇒ selector present or source ∈ {canonical.inherit, *.actor inherit}`.

## Suggestions [6]
1. **S-1 (was W8)** Add a cheap guard so the companion test cannot silently rot before Phase 07: e.g. test fails fast with a clear message when `.cache/evcrate/vscode-model-bindings-dist/contracts.js` is missing, and record the manual two-step command in the phase/freeze report.
2. Readability: `model-intent.ts:10,24,37` and many `contracts.ts`/`runtime-contracts.ts` lines compress multiple declarations/>130 cols to stay under 200 LOC. Prefer splitting into a new file (e.g. `model-intent-types.ts`) over line-packing before Phase 03 adds anything.
3. DRY: `ACTOR_ID_PATTERN`, `SHA256_HEX`, `isPlainObject`/`isSafePlainRecord`, error classes remain duplicated core vs extension (parity test covers constants only, not regexes/`SHA256_HEX`/`ACTOR_ID_PATTERN`/`maxBindings…`). Add regex-source parity assertions (`.source`) to the test.
4. `receipt.inputs` `.vsix` exclusion is case-sensitive (`a/B.VSIX` accepted, `companion-package-contracts.ts:164`); lowercase before check.
5. `vscode.proposed.chatPromptFiles.d.ts` is still a hand-authored subset (Phase 01 spike file contains only `chat` namespace); keep provenance header but add hash/`vscode.d.ts` source before receipt `inputs` lists it (Phase 07).
6. Test gaps: remote-authority path in `resolveInstallationRoot`, HOME invalid/unapproved, diagnostics negatives, `canReclaimGeneration` positive/active-turn, CLI `--vscode-profile` bad names, root-identity idempotence (W-A).

## Positive Observations
- Every Cycle 1 hard fail-open (NaN budget, `%2e%2e`, untrusted HOME, audit junk) is now closed with fail-closed errors and typed codes.
- Validators now return frozen clones (no input aliasing) across audit/diagnostics.
- Shared `validateToolsAndDelegation` removes duplicated logic (DRY) between manifest and audit.
- Layering still clean: no `vscode` import into core; no CLI import into extension; no runtime stubs.
- Docs coherent: gate amendment, deferred Phase 09 live checks, ownership table, Phase 07 script ownership.

## Recommended Actions
1. Fix W-A (canonical idempotent root identity + control-char reject) and add round-trip test.
2. Break contracts↔diagnostics cycle (W-B) before Phase 04 adds importers.
3. Bound/cohere diagnostics (W-C).
4. Optional: S-1…S-6.

## Validation
| Command | Result |
|---|---|
| `npm run build` | PASS |
| `npx tsc -p extensions/vscode-model-bindings/tsconfig.json` | PASS |
| `node --test tests/vscode-companion/contracts.test.mjs` | PASS 4/4 |
| Probe scripts (temp, deleted): W1–W6 re-checks, URI identity idempotence, diagnostics bounds | W1–W6 closed; W-A/W-C confirmed |
| `wc -l` | all code files <200 |
| `npm run lint` | no-op script (not meaningful) |

## Metrics
- Type coverage: strict TS both compilations; remaining casts after validation only.
- Test coverage: not measured (no tooling); 4 tests.
- Lint: n/a.

## Unresolved Questions
1. Root identity canonical form: percent-encoded (VS Code `Uri.toString()` style) or decoded POSIX path? Needed to fix W-A and match `Uri` objects at runtime.
2. Should diagnostics `actors` be capped at `maxActorsPerRoot` (512) and enforce status/reason coherence in the validator or in the producer?
3. Is leaf-module split (W-B) in Phase 02 scope or deferred to Phase 04 owner?
