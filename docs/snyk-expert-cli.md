# Common Snyk expert bundle

## Architecture and scope

`ext/snyk-expert/.agents/` is the target-neutral runtime payload. The Node installer copies its explicit inventory into the target project's `.agents/`; it creates no target-specific configuration or automatic discovery adapter. A host must support common skills or explicitly read the entrypoints and references. `.agents/agents/snyk-expert.md` is a portable specialist instruction document, not a promise of native subagent registration.

One specialist owns scope and finding decisions. Three task skills separate CLI setup/authentication/scanning (`snyk-cli`), dependency remediation (`snyk-fix`), and read-only compatibility assessment (`dependency-upgrade-review`). Maven/Spring and Node.js/TypeScript have concrete dependency procedures. Snyk Code source findings remain a distinct analysis lane, never converted into dependency upgrades.

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


## Bounded remediation cycles — Phase 02 contracts complete

A general remediation cycle extension is planned in [plans/261012-1944-general-snyk-remediation-cycles/plan.md](../plans/261012-1944-general-snyk-remediation-cycles/plan.md) to add a command-style skill (`.agents/skills/cmd-snyk-remediate/SKILL.md`) to `ext/snyk-expert/`. Phase 02 reference contracts are completed in the maintained references [`finding-and-owner-contract.md`](../ext/snyk-expert/.agents/skills/snyk-fix/references/finding-and-owner-contract.md) and [`verification-and-results.md`](../ext/snyk-expert/.agents/skills/snyk-fix/references/verification-and-results.md). The current installed inventory remains limited to the three existing task skills; entrypoint/command integration (Phases 03–06) and live operational qualification (Phase 07) remain pending.

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
- Status: Phase 02 reference contracts complete; entrypoint/command integration (Phases 03–06) and live operational qualification (Phase 07) remain pending.
