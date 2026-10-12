# Common Snyk expert bundle

## Architecture and scope

`ext/snyk-expert/.agents/` is the target-neutral runtime payload. The Node installer copies its explicit inventory into the target project's `.agents/`; it creates no target-specific configuration or automatic discovery adapter. A host must support common skills or explicitly read the entrypoints and references. `.agents/agents/snyk-expert.md` is a portable specialist instruction document, not a promise of native subagent registration.

One specialist owns scope and finding decisions (`snyk-expert.md`). One coordinator skill (`cmd-snyk-remediate`) coordinates bounded remediation cycles. Three task skills separate CLI setup/authentication/scanning (`snyk-cli`), dependency remediation (`snyk-fix`), and read-only compatibility assessment (`dependency-upgrade-review`). The package bundle installer maintains an explicit 12-asset inventory (`ASSET_INVENTORY` in `ext/snyk-expert/lib/inventory.js`) across these entrypoints and their reference guides. Maven/Spring and Node.js/TypeScript have concrete dependency procedures. Snyk Code source findings remain a distinct analysis lane, never converted into dependency upgrades.

The package bundle maintains exclusively `.agents/` resources. EVCrate canonical/generated resources and unresolved historical workflows remain untouched. Current documentation lives here, in `ext/snyk-expert/README.md`, and in `ext/snyk-expert/docs/usage.md`.

Installation is not scanner installation, authentication, scan permission, publication, or dependency-edit approval. The parent owns exact target scope, credentials, network/data transmission, allowed paths, execution boundary and human gates. No credentials are supplied by this package. Live authenticated Snyk and host qualification require separately authorized inputs.

## Installation and operation

Current packaged guide: [usage](../ext/snyk-expert/docs/usage.md). From this checkout:

```bash
node ext/snyk-expert/bin/install.js --target /path/to/project --dry-run
node ext/snyk-expert/bin/install.js --target /path/to/project
```

Explicitly load the installed specialist and selected skill references in the executing host. Use `snyk-cli` for operator-authorized setup/login and SCA/Code acquisition; `snyk-fix` for dependency analysis/remediation; `dependency-upgrade-review` for read-only exact-candidate assessments. HTML is optional evidence, not required to start CLI acquisition.

The installer needs trusted exclusive destination ownership. Collision/symlink defenses apply during preflight, not as an adversarial race-proof filesystem boundary. The package README and `docs/usage.md` document the current `.agents` contract.


## Bounded remediation cycles — Phase 06 local integration review and corrections complete

A general remediation cycle extension in [plans/261012-1944-general-snyk-remediation-cycles/plan.md](../plans/261012-1944-general-snyk-remediation-cycles/plan.md) adds the main-owned command-style coordinator [`.agents/skills/cmd-snyk-remediate/SKILL.md`](../ext/snyk-expert/.agents/skills/cmd-snyk-remediate/SKILL.md) to `ext/snyk-expert/`. Phase 02 reference contracts are complete in [`finding-and-owner-contract.md`](../ext/snyk-expert/.agents/skills/snyk-fix/references/finding-and-owner-contract.md) and [`verification-and-results.md`](../ext/snyk-expert/.agents/skills/snyk-fix/references/verification-and-results.md); Phase 03 specialist and skill cutover is complete across `snyk-expert.md`, `snyk-fix`, `snyk-cli`, and `dependency-upgrade-review`; Phase 04 (`cmd-snyk-remediate/SKILL.md`) coordinator is authored (`2026-10-12T22:20:46+07:00`); Phase 05 (`2026-10-12T22:54:45+07:00`) registers `cmd-snyk-remediate/SKILL.md` in `ext/snyk-expert/lib/inventory.js` (bringing explicit bundle inventory to 12 assets), updates package scope description in `package.json`, expands the evaluation catalog `evals/evals.json` to 49 scenarios covering SNYK-001 through SNYK-036 across Delivery, Specification, and Operational evidence classes, and hardens packaging and installer regression tests; and Phase 06 (`2026-10-12T23:41:05+07:00`, review approved 9/10 Cycle 2) reconciles Phase 05 review warnings (removed fragile length heuristics, enforced explicit `Stimulus:` checks, aligned SNYK-035 storage boundary specifications with contract trace vocabulary and access-controlled single-writer ownership), verifies 46/46 package tests, 12/12 JS files, isolated direct install/dry-run sentinel preservation, 58/58 relative link resolution without repo escape, clean tarball packaging, and collision refusal preserving user modifications. Live operational qualification remains scheduled for Phase 07.

### Pre-edit concrete procedure binding & ecosystem-neutral evaluation

Before any edit is planned or executed, a complete, concrete 6-point procedure must be bound:
1. **Toolchain & support evidence:** Actual manager name, version, runtime, platform, and executable path; official manager and Snyk support and parser evidence; authored control fields/sections, effective values, and baseline evidence.
2. **Scope & resolution boundary:** Exact owner/coupled set; workspace/module/profile/shared resolution scope; allowed edit paths and native generated artifacts (lockfiles, POMs, manifests).
3. **Literal commands & authority:** Literal authored update, native regeneration, inspection, check, and scan argv, cwd, and options; expected side effects; plugins, scripts, and download execution authority.
4. **Graph & consumer verification:** Baseline and resolved graph; planned effective-field inspection; expected consumer observations (logging, crypto, serialization, etc.) and native tests/build.
5. **Snyk scanner coverage:** Supported Snyk product/parser/format and full expected-project coverage; private immutable outputs and safe diagnostic path if any.
6. **Safety, ownership & recovery:** Full baseline tuple, single-writer operator identity, protected user content, exact owned changes/recovery, and precise gaps.

**Ecosystem-neutral evaluation & human approval:** Any ecosystem meeting this complete 6-point binding, official Snyk/manager support, and execution authorization follows the standard workflow without hardcoded allowlists or ecosystem-specific gates beyond standard compatibility, policy, and authorization requirements (Python is illustrative, not a required target; Node.js/TypeScript and Maven/Spring protections remain preserved as reference implementations). Exact, baseline-bound human approval collected by Main is strictly required before mutating dependencies for major, breaking, uncertain, license-policy, runtime, or scope-changing proposals; rejection or revision does not consume an attempt. Native generated artifacts (lockfiles, BOMs) are regenerated using native tools, never forged. Independent supported proposals proceed absent a global failure; no universal per-ecosystem check command.

### Immutable first-scan source inventory and authentic scan-zero presence

Source facts remain assertions, not baseline presence. The first-scan source inventory is strictly immutable:
- **Authentic scan-zero presence distinctions:** Captures supplied report assertions alongside authentic scan-zero presence: `present-at-baseline`, `not-reproduced-at-baseline`, `incomparable`, `failed/unavailable`, or `unknown`.
- **One-time initialization:** If initialized before authentic baseline scanning executes, the presence column is marked `unknown (pending scan-zero)`. The subsequent execution and binding of authentic baseline scan evidence provides the single authorized initialization of this presence record, after which it remains strictly immutable.
- **Integrity rules:** Missing original records remain incomplete and must never be reconstructed from counts or subsequent post-scans. A finding marked `not-reproduced-at-baseline` is never credited as fixed.
- **Source & occurrence ledgers:** One source row per supplied record (counts never substitute for rows). The occurrence ledger retains one row for every supplied occurrence/path, preserving source order, edges, variants, and module/profile distinctions.

### Retained run record and restart-safe attempt counting

The run record maintains durable state across actor handoffs, pauses, and context restarts:
- **Durable fields:** `run_id` (stable local label, never advisory ID), `target_root`, `baseline_identity`, `current_baseline`, `scope_identity`, `bound_n` ($N \ge 1$), `attempts_started` ($0 \le \text{attempts\_started} \le N$), `writer_identity` (single-writer operator), `current_stage`, `next_action`, `stop_reason`, `proposal_references`, `assessment_references`, `decision_references`, `scan_references`, `inventory_links`, `changed_paths_and_checks`, `in_flight_state` (`idle` | `started` | `finished`), `attempt_record`, and `pause_and_revision_history`.
- **Count before mutation:** Increment `attempts_started` once and durably persist the attempt-start record (attempt number, proposal identity, material intent hash, pre-attempt baseline tuple, and `started` marker) immediately before the first authorized operation capable of changing dependency inputs or resolution state (including native update commands, resolution, or mutating scanners/resolvers). Inability to durably persist the count halts writes immediately.
- **Subsequent commands:** Subsequent commands within the same reviewed one-set procedure do not increment the count again.
- **No refunds:** Tool failures, syntax errors, native update failures, and authorized inverse rollbacks never refund an attempt count.
- **Pause/resume and crash recovery safety:** Pre-write pauses, approval waits, and context restarts consume zero attempts ($0$) and preserve the run record, bound $N$, and `attempts_started`. The `in_flight_state` transitions from `idle` to `started` upon recording the attempt-start record, and to `finished` only after verification or selective rollback completes. On resume, crash recovery checks `in_flight_state`: if marked `started` (unfinished attempt), stop and recover using the pre-attempt baseline tuple and recorded change records; if marked `idle` or `finished`, compare against the recorded current/post-attempt baseline tuple to detect unexpected drift. Unexplained drift or missing history blocks further dependency writes, never starting a fresh attempt.
- **Budget intake, increase & exhaustion:** Missing, zero, negative, or non-integer $N$ must be obtained explicitly from the operator before edits. If the operator explicitly increases $N$ in the same retained record, existing history and `attempts_started` are retained without reset. When $\text{attempts\_started} = N$, no new attempt may start; remaining authorized operations within the already-started coherent attempt may continue to completion, required verification, or authorized selective recovery.
- **Clean run zero attempts:** Clean runs or read-only analyses without dependency/resolution mutations complete with zero attempts consumed ($\text{attempts\_started} = 0$). Terminal scan and review execution on unchanged state consume zero attempts provided the scan neither changes nor is capable of changing dependency inputs or resolution.
- **Forward corrections & selective rollback:** Any new corrective set consumes another attempt ($+1$). Safe authorized selective rollback requires explicit parent authority and recorded before/after identities; reverses only owned hunks/values (never entire files, `git reset --hard`, `git checkout -- .`, or `git clean`); does not refund the attempt count.

### Private target-contained evidence storage bindings & safeguards

Default raw scans and run ledgers to an operator-bound private ignored directory inside the target root (`target_root`), bound before artifact-producing execution:
- **Containment:** Exact allowed paths; resolved target-contained ancestors and leaves; no symlink escape, unsafe collision, or ambiguous destination; single main-owned writer.
- **Access:** Explicit report-write authority plus access-controlled ancestors and destination directory. Report-write authority grants no dependency mutation, scanner execution, network transmission, or code execution permission. No automatic permission repair or assumption that ignore rules make data private.
- **Git ignore:** Evidence must remain untracked and effectively ignored. An ignored pathname is neither security proof nor a baseline exemption for ignored dependency or build inputs. No automatic ignore edits, untracking, or force-add.
- **Content:** Original scan bytes and append-only observations; never overwrite original scan bytes (new output paths and append-only ledgers only); no tokens, credentials, copied manifests/lockfiles, executable recipes, or active content.
- **Coverage:** Storage is not a dependency/runtime/build input and must not change scan coverage. No Snyk filters/exclusions to hide it.
- **Counting & baseline isolation:** Safe authorized ledger growth alone does not invalidate approval or comparable scan scope; evidence-only identities are proved separately from the full dependency/resolution/runtime/policy baseline. Proved, main-owned, authorized evidence-only writes strictly satisfying safeguards remain outside $N$. Scanner, resolver, and build side effects are not automatically exempt.
- **Unsafe storage pause:** Unsafe, unauthorized, unprotected, tracked, unignored, or coverage-affecting storage pauses artifact-producing execution immediately and reports the exact operator prerequisite. No silent external fallback or automatic ignore/access repair. Specialist `analyze` and upgrade review retain zero target writes.

### Every-attempt observation ledger, separate post-only provenance & procedure learning

- **Every-attempt observation ledger:** After EVERY attempt ($1 \dots N$), append one observation row for EVERY original source record from the immutable first-scan inventory, including unchanged, unattempted, gated, rejected, failed, or unavailable rows. Retain links to ALL ordered occurrences. Counts are strictly supplementary. Tracks attempt #, source record identity, occurrence references, baseline observation (`present-at-baseline`, `not-reproduced-at-baseline`, `incomparable`, `failed/unavailable`, `unknown`), post-scan observation (`present`, `absent`, `incomparable`, `failed/unavailable`, `unknown`), graph/consumer check, disposition (`fixed`, `remaining`, `blocked`, `unverified`), and evidence locator/SHA-256 (proving identity, not authenticity).
- **Separate post-only inventory and provenance:** Findings appearing exclusively in post-scans or database additions are tracked in a dedicated post-only ledger without modifying the immutable original source inventory. Tracks scan-introduced attempt #, causal attribution (`established causal link`, `unknown`, `database-added`), graph/consumer evidence, disposition (`newly-introduced`, `unverified`), and coverage/policy limits.
- **Distinctions and drift accounting:** Complete advisory absence is strictly distinguished from individual path disappearance (pruned/filtered paths do not constitute remediation). License policy acceptance/rejection is a separate human policy decision, never a vulnerability fix. Scanner database drift and `.snyk` policy rule changes are explicitly recorded and never credited as remediation.
- **Procedure learning within run record:** Append observed toolchain, support sources, authored/effective controls, planned versus executed literal commands/options, side effects, outcomes, and qualified limits into the run record. Observations describe observed facts, not recommendations; failed diagnostics never become recommended fixes.
- **Inert sanitized UNTRUSTED candidate note:** Main derives an inert sanitized candidate note only if useful for future reference: removes private coordinates, names, paths, endpoints, organization/project IDs, source code, and credentials; explicitly labels the note as `UNTRUSTED`, non-universal, limited to observed qualified surfaces, and strictly inert. It is NOT an executable recipe or execution authority, and does NOT rewrite installed skills or force reinstallations. Skill promotion is a separate human-approved source-authoring maintenance task, never an automatic skill update or runtime prerequisite.

### Terminal live review scan ownership cutover to Main

- **Specialist local verification boundary:** The specialist executes local verification (effective graph, native build/test, affected consumer probes) and hands off with `local verification complete; Snyk verification pending`. The specialist never declares findings `fixed` or overall run `completed`.
- **Main live scan ownership:** Main owns live authenticated Snyk scans (`baseline-scan` and terminal live review `post-scan`).
- **Terminal scan requirement:** Real terminal CLI execution is required even for clean/no-mutation runs. An initial executed scan may serve as terminal review only for an actual unchanged terminal state fully inspected as final review; a supplied initial report alone cannot substitute.
- **Evidence comparability for scan reuse:** A scan may serve as next baseline or terminal review only when real authenticated CLI provenance, original byte locator/hash/time, exact state, resolved graph, environment/runtime, scanner/version, product/org/endpoint, expected projects, argv/policy, and freshness remain strictly comparable.
- **Scanner exit codes & project coverage:** Exit 0 = complete, no vulnerabilities found; Exit 1 = complete with findings. For both exit 0 and exit 1, full artifact and expected project/module coverage must be verified; empty outputs or omitted projects indicate incomplete evidence. Exit 2/3, omissions, or malformed outputs = incomplete evidence / failed review.
- **Diagnostic scan separation:** A clean diagnostic scan after failed required tests/probes cannot clear failed tests or resume the remediation loop; overall status remains `partial`.
- **Overall status precedence:** Distinct from per-finding dispositions, evaluated by strict condition precedence rather than an ordered workflow progression:
  1. `analyzed`: Read-only analysis completed with exactly zero target edits.
  2. `needs-approval`: Exact concrete proposal ready, awaiting human decision; zero gated writes executed.
  3. `blocked`: Missing prerequisite prevents execution from starting.
  4. `partial`: Work started or eligible subset applied, but subsequent work is deferred, failed, or incomplete; once work starts, command failures yield `partial`, and resuming cannot reset started history back to `needs-approval` or `blocked`.
  5. `completed`: All required authorized actions and checks are complete, and every newly-introduced risk has a documented disposition (resolved or human-accepted); does not imply all source findings are fixed.

### Main-owned command coordinator and 8-stage correction loop (`cmd-snyk-remediate`)

[`cmd-snyk-remediate/SKILL.md`](../ext/snyk-expert/.agents/skills/cmd-snyk-remediate/SKILL.md) coordinates bounded Snyk Open Source remediation cycles as a portable main-session procedure:
- **Host-neutral invocation and inline fallback:** Binds the canonical installed `.agents/` bundle root separately from `target_root` and resolves sibling links relative to `.agents/skills/cmd-snyk-remediate/`. When native specialist registration is unavailable, Main executes inline by reading `../../agents/snyk-expert.md`, selected task skills, and required references under identical boundaries, reporting inline mode honestly without claiming native actor registration, independent review, or OS sandboxing.
- **Intake, budget $N$, and initialization boundary:** Requires explicit positive integer $N \ge 1$ (recovering existing `run_id`, bound $N$, `attempts_started`, and `in_flight_state` on resume) and binds private ignored target-contained evidence paths before any artifact output (including the initial baseline scan). Initialization is outside $N$ only for proven read-only observations and safe main-owned evidence-only writes; any command capable of mutating dependency inputs or resolution state carries no initialization exemption.
- **8-stage runtime sequence (Steps 1–8):**
  1. **Step 1 — Scan / refresh evidence (Main):** Real authenticated Snyk CLI scan to a new immutable private evidence file (or strict comparability reuse); when returning from Step 8, refreshes evidence, closes the corrective attempt (`in_flight_state: 'finished'`), reconciles original and post-only ledgers, and transitions directly to Step 7 without a duplicate label-only scan.
  2. **Step 2 — Select and assess one coherent set (Specialist / Inline):** Binds the complete 6-point pre-edit procedure under the ecosystem-neutral gate and performs read-only `dependency-upgrade-review` (`eligible`, `needs-approval`, or `blocked`) with zero target writes.
  3. **Step 3 — Pre-edit gate (Main):** Confirms policy-eligible patch/minor evidence or collects human `approve` / `reject` / `revise` for gated proposals (`reject` and `revise` consume $0$ attempts).
  4. **Step 4 — Apply one coherent set (Specialist / Inline):** Verifies $\text{attempts\_started} < N$ and baseline match, increments `attempts_started` by $1$ with `in_flight_state: 'started'` before the first potentially mutating operation, and applies only that coherent owner set.
  5. **Step 5 — Native local verification (Specialist / Inline):** Verifies effective graph, native build/tests, and affected-consumer probes; returns `local verification complete; Snyk verification pending` (or stops the ordinary loop before Step 6 at `partial` on any local check failure, recording `unavailable`/`unverified` dispositions without requiring an unsafe scan).
  6. **Step 6 — Live final review (Main):** Executes a fresh same-scope Snyk CLI scan on resulting state after passing Step 5, appends observation rows for every original source record plus separate post-only findings and procedure learning, and marks `in_flight_state: 'finished'`.
  7. **Step 7 — Review decision (Main):** Evaluates reconciled ledgers and remaining budget ($N - \text{attempts\_started}$) for closeout, next independent set (Step 2), or required review correction (Step 8).
  8. **Step 8 — Apply review corrections before rescan:** Formulates a new exact corrective proposal against the resulting baseline (Step 2), passes the pre-edit gate (Step 3), persists a new attempt count $\text{attempts\_started} + 1 \le N$ (Step 4), completes native local verification (Step 5), and returns to Step 1 for a fresh changed-state scan before Step 7.
- **Observed procedure learning and source maintenance boundary:** Appends observed commands, controls, outcomes, and qualified limits to the private run record throughout execution; derives an inert sanitized `UNTRUSTED` candidate note in reports when useful; and strictly prohibits editing installed `.agents/` skills or forcing reinstalls during runtime (reusable improvements are proposed only as separate human-approved source-authoring maintenance tasks).
## Change record — 2026-10-09

- Common `.agents` distribution. Package README and docs describe exclusively the `.agents` layout, CLI workflow, and Node.js/TypeScript support.
- Added `snyk-cli` setup/auth/scan procedure, separate SCA/Code transmission and result lanes, original JSON/SARIF plus optional version-supported HTML, exact exits and workspace coverage.
- Added concrete npm/Yarn/pnpm Node.js/TypeScript ownership, manifest/lockfile/workspace updates, peer/engine/module/declaration compatibility and local compiler/runtime/rescan verification.
- Verified 26/26 package tests, 7 Node syntax checks, installer/pack/extract/install smoke, and constructed prompt scenarios.
- Evidence: [implementation plan](../plans/261009-1535-snyk-cli-node-typescript/plan.md) and [validation](../plans/261009-1535-snyk-cli-node-typescript/reports/validation.md). No authenticated Snyk scan, real target upgrade/fix, native discovery/permission parity or publication claim.

## Planning record — 2026-10-12 (Phase 01 — Contracts and prerequisites)

- Defined Phase 01 contracts and qualification prerequisites for proposed bounded general Snyk remediation cycles (`cmd-snyk-remediate`).
- Verified extension scope boundaries: authoring targets only `ext/snyk-expert/`; canonical EVCrate harness projections remain untouched.
- Mapped 36 acceptance cases across delivery, specification, and operational evidence classes (SNYK-001–036).
- Inventoried live operational qualification prerequisites (PREREQ-01–08) across isolated targets, pinned CLI, authentication, network, and storage.
- Evidence: [Phase 01 plan](../plans/261012-1944-general-snyk-remediation-cycles/phase-01-contracts-and-prerequisites.md), [design contracts](../plans/261012-1944-general-snyk-remediation-cycles/design-contracts.md), [acceptance matrix](../plans/261012-1944-general-snyk-remediation-cycles/acceptance-matrix.md), [prerequisites report](../plans/261012-1944-general-snyk-remediation-cycles/reports/qualification-prerequisites.md).
- Status at Phase 01 close: Planning only; runtime implementation (Phases 02–06) and live operational qualification (Phase 07) remain pending (Phase 07 requires operator-provided live prerequisites).

## Change record — 2026-10-12 (Phase 02 — Procedure and ledger contracts)

- Completed Phase 02 procedure and lossless ledger contracts in `ext/snyk-expert/.agents/skills/snyk-fix/references/finding-and-owner-contract.md` and `ext/snyk-expert/.agents/skills/snyk-fix/references/verification-and-results.md`.
- Formalized pre-edit 6-point concrete procedure binding and ecosystem-neutral evaluation contract without hardcoded allowlists.
- Formalized immutable first-scan source and occurrence ledgers with authentic scan-zero presence distinctions (`present-at-baseline`, `not-reproduced-at-baseline`, `incomparable`, `failed/unavailable`, `unknown`) and one-time initialization from `unknown (pending scan-zero)`.
- Defined retained run record fields, `in_flight_state` tracking (`idle` | `started` | `finished`), and restart-safe attempt counting rules (count before mutation, no refunds, pause/resume safety, budget increase/exhaustion).
- Formalized private target-contained evidence storage bindings and safeguards (containment, access, git ignore, content, coverage, baseline isolation, unsafe storage pause).
- Defined every-attempt observation ledger across all original findings, separate post-only findings provenance, and procedure learning observations with inert sanitized UNTRUSTED candidate note.
- Defined Main-owned terminal review in reference contracts (`local verification complete; Snyk verification pending`); entrypoint integration remains pending.
- Evidence: [Phase 02 plan](../plans/261012-1944-general-snyk-remediation-cycles/phase-02-procedure-and-ledger-contracts.md), updated references in `ext/snyk-expert/.agents/skills/snyk-fix/references/`, review verdict PASS (8.5/10).
- Status at Phase 02 close: Phase 02 reference contracts complete; specialist cutover (Phase 03), command integration (Phases 04–06), and live operational qualification (Phase 07) follow.

## Change record — 2026-10-12 (Phase 03 — Specialist and skill cutover)

- Completed Phase 03 specialist and skill cutover of General Snyk remediation cycles at 2026-10-12T22:02:47+07:00 (plan records review approved 8/10; 53/53 package tests passing across 8 suites; plan reference: `plans/261012-1944-general-snyk-remediation-cycles/phase-03-specialist-and-skill-cutover.md`).
- Specialist and fix cutover: bound one-set execution per mutating invocation with retained $N$, incrementing `attempts_started` once before first mutation; specialist hands off `local verification complete; Snyk verification pending` to Main with native graph/build/test evidence upon successful checks, while failed local checks return partial or stopped evidence; Main retains exclusive ownership of live Snyk scans and terminal review.
- Neutral pre-edit procedure evaluation: replaced blanket unsupported-ecosystem stops with a neutral 6-point pre-edit procedure evaluation table; managers with complete official support and execution authorization run under existing authority without hardcoded allowlists.
- Read-only zero target writes: analyze and upgrade-review instructions prohibit target edits, dependency mutations, and private evidence writes in those modes.
- Bound evidence storage & safe pause: the `snyk-cli` skill instructions require a main-bound private ignored target-contained destination and mandate pausing on unauthorized, unignored, tracked, or coverage-affecting storage without silent external fallbacks.
- Safe CLI troubleshooting: added proxy vs CA trust diagnostics (npm cafile, Node extra CA, standalone store distinct) with strict prohibition on TLS verification bypass.
- Preserved concrete safeguards: retained all Node.js/TypeScript (lockfile, peer, workspace, engines, compiler) and Maven/Spring (profiles, BOMs, reactor) safeguards in specialized remediation references.
- Test verification: 53/53 package tests pass across 8 suites in `ext/snyk-expert/tests/`, including 14 workflow-contract tests in `ext/snyk-expert/tests/workflow-qualification.test.mjs`; live authenticated Snyk qualification and runtime remediation remain scheduled for Phase 07.
- Status at Phase 03 close: Specialist and skill cutover complete; command coordinator loop (`cmd-snyk-remediate`, Phase 04), delivery scenarios (Phase 05), integration review (Phase 06), and live operational qualification (Phase 07) scheduled for subsequent phases.

## Change record — 2026-10-12 (Phase 04 — Main-owned command and correction loop)

- Completed Phase 04 main-owned command and correction loop of General Snyk remediation cycles at 2026-10-12T22:20:46+07:00 (review approved 8/10 with 6 non-blocking warnings noted for Phase 05/06 reconciliation; 25/25 relative links resolved in `cmd-snyk-remediate/SKILL.md` and 53/53 existing package tests passing prior to Phase 05 inventory/scenario expansion, which do not prove live runtime behavior; plan reference: `plans/261012-1944-general-snyk-remediation-cycles/phase-04-command-and-correction-loop.md`).
- Authored `ext/snyk-expert/.agents/skills/cmd-snyk-remediate/SKILL.md`: host-neutral main-session coordinator binding canonical `.agents/` bundle root separately from `target_root`, with honest explicit-read inline fallback when native specialist registration is unavailable.
- Encoded explicit intake, positive integer budget $N \ge 1$ with resume continuity, and private target-contained evidence binding before any artifact output (including initial baseline scan), keeping mutating commands strictly non-exempt during initialization.
- Encoded the numbered 8-stage runtime sequence (Steps 1–8), ecosystem-neutral 6-point pre-edit procedure gate, specialist handoff (`local verification complete; Snyk verification pending`), Main-owned live Snyk review with every-finding and post-only ledger reconciliation, and Step 8 post-review corrections returning to Step 1 fresh changed-state scan before Step 7 without duplicate label-only scans.
- Encoded append-only observed procedure learning, inert sanitized `UNTRUSTED` candidate notes, and separate human-approved source-authoring maintenance proposals with zero runtime installed-skill mutation.
- Status at Phase 04 close: Command coordinator authored; installer registration and delivery scenarios (Phase 05), integration review (Phase 06), and live operational qualification (Phase 07) scheduled for subsequent phases.

## Change record — 2026-10-12 (Phase 05 — Delivery and acceptance scenarios)

- Completed Phase 05 delivery and acceptance scenarios of General Snyk remediation cycles at 2026-10-12T22:54:45+07:00 (5/8 phases complete, 62.5% progress; review approved 8.5/10 with 3 minor warnings noted for Phase 06 reconciliation; plan reference: `plans/261012-1944-general-snyk-remediation-cycles/phase-05-delivery-and-acceptance-scenarios.md`).
- Registered `skills/cmd-snyk-remediate/SKILL.md` in `ext/snyk-expert/lib/inventory.js`: `ASSET_INVENTORY` now contains 12 explicit assets (`agents/snyk-expert.md`, `skills/cmd-snyk-remediate/SKILL.md`, and 10 task skill and reference assets).
- Updated `ext/snyk-expert/package.json` description to "Portable .agents Snyk CLI, bounded remediation coordinator, and ecosystem remediation skills with a project-local installer", accurately describing coordinator and ecosystem scope.
- Expanded evaluation catalog `ext/snyk-expert/evals/evals.json` to 49 scenarios covering all acceptance matrix IDs SNYK-001 through SNYK-036 across Delivery, Specification, and Operational evidence classes. Formulates multi-variant scenario specifications for SNYK-035 (storage boundaries: safe target-contained append vs. unsafe/tracked/unignored storage pause) and SNYK-036 (observed procedure learning and inert sanitized `UNTRUSTED` candidate notes without automated skill mutation).
- Added packaging and installation regression tests in `ext/snyk-expert/tests/cli-and-packaging.test.mjs`: asserts unique inventory entries, explicit `cmd-snyk-remediate` inclusion, collision refusal preserving pre-existing unrelated sentinel files without force while allowing authorized `--force --yes` replacement, and clean pack/extract/install resolution from an unrelated working directory.
- Refactored `ext/snyk-expert/tests/workflow-qualification.test.mjs`: removed fragile phrase-pinning tests asserting arbitrary prose fragments; retained structural schema checks verifying schema adherence, acceptance ID coverage, SNYK-035/036 variants, and evidence-class categorization, explicitly labeled as non-runtime specification evidence.
- Status at Phase 05 close: Delivery and acceptance scenarios complete; integrated delivery verification and code review (Phase 06) and live operational qualification (Phase 07) scheduled for subsequent phases.

## Change record — 2026-10-12 (Phase 06 — Local integration review and corrections)

- Completed Phase 06 local integration review and corrections of General Snyk remediation cycles at 2026-10-12T23:41:05+07:00 (6/8 phases complete, 75% progress; review approved 9/10 Cycle 2; plan reference: `plans/261012-1944-general-snyk-remediation-cycles/phase-06-integration-review-and-corrections.md`).
- Reconciled Phase 05 review warnings W1, W2, W3: removed fragile length heuristics, enforced explicit `Stimulus:` checks across all 49 evaluation scenarios, and aligned SNYK-035 storage boundary specifications with contract trace vocabulary (`current_stage`, `stop_reason`, `next_action`, access-controlled ancestor/leaf containment, single-writer ownership).
- Local integration verification: 46/46 package tests passing in `ext/snyk-expert`, 12/12 JS files syntax-verified via `node --check`, isolated direct install/dry-run sentinel preservation, 58/58 relative link resolution without repo escape, clean tarball packaging (24 assets) without test/report leakage, extracted package execution from unrelated cwd, and collision refusal preserving user modifications.
- Operational boundary: local smoke and specifications verified; live authenticated Snyk scans and model/tool trace qualification remain Phase 07 gates.
- Status at Phase 06 close: Local integration review and corrections complete; live operational qualification scheduled for Phase 07.
