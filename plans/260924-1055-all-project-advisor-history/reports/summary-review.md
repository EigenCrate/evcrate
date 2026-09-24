# Summary review (source inspection only)

User's reported live observations stand; no live checks rerun. Current source review:

| Item | Status | Necessary improvement |
|---|---|---|
| 1. 27 vs 230 | Open by design | Single-project scan `plugin/backend/history-scanner.cjs:56-75` and context binding `binding.cjs:104-148`; approve separate account-wide history source and filter same bounded snapshot. `*` existing host grant is for configured targets only, not historical root. |
| 2. False target | Fixed for evcrate; brittle | `viewer/src/providers/dam-hopper-port-provider.ts:49-59` now hardcodes `evcrate`; get actual authorized context label, or use `All Projects` for root mode, not another constant. |
| 3. Missing advisor response | Present; minor omission | `viewer/src/views/history-detail.tsx:189-251` renders goal/question/recommendation/rationale/checks; response section at :206 hides cautions/checks-only results when recommendation/rationale/must-fix absent. Extend guard. |
| 4. Time of day | Present | `viewer/src/views/history-view.tsx:170` uses `toLocaleString()`; no change needed. |
| 5. UUID navigation | Visually fixed, wrong fallback | Host `packages/ui/src/plugins/use-plugin-navigation.ts:91-99` calls any ID longer than 20 chars `EVCrate Advisor`, mislabels unrelated UUID plugins. Read trusted title/manifest/publisher; generic fallback otherwise. |
| 6. LAN digest | Fallback present; untested branch | Host `plugin-document.ts:125-144` uses pure JS without `crypto.subtle`; `plugin-document.test.ts:12-16` supplies Web Crypto globally. Add no-subtle test vectors/asset digest parity and note blocking 5 MiB sync hashing cost; HTTPS preferred operationally. No live rerun. |
| 7. Login friction | Intentional development path; production guard needed | Production normally configures MongoDB (`server/src/main.rs:333-344`) and uses credential verification. Explicit test/dev token issuance must remain functional. But `server/src/api/auth.rs:355,476` also mints JWTs when `db.is_none()` without an explicit dev flag; `main.rs:343-344` can set that state when MongoDB env is absent. Guard this misconfigured-production case without breaking the test server. `apps/web/index.html:8-17` seeds an auth-none/evcrate profile in all builds; scope it to development/test. |

Additional blocker to consistent filtering: `plugin/backend/cursor-manager.cjs:61-76` checks obsolete scalar filter names (`status`, `has_outcome`, `outcome_result`), while `src/protocol/advisor-plugin-data-api.ts:296-333` accepts plural arrays. Include parity fix when implementing project filter; metrics and table must agree.

## Unresolved questions

- No user choice remains. Numeric scan budget and real owner-runner deployment remain qualification inputs; user confirmed installed owner-root access for every authenticated account, EVCrate-persisted safe names with unknown fallback, and independently labeled Configuration/Evaluations.
