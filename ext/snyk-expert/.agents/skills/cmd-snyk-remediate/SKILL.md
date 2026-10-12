---
name: cmd-snyk-remediate
description: Coordinate main-owned bounded Snyk Open Source dependency remediation cycles with explicit attempt budget N, private target-contained evidence ledgers, pre-edit compatibility review, human approval gates, one-set specialist execution, live Snyk verification, and post-review correction loops.
---

# Bounded Snyk dependency remediation coordinator

Coordinate main-owned Snyk Open Source (SCA) dependency remediation across bounded review and correction cycles. This skill is a portable main-session procedure, not an executable runner, background daemon, or assumed slash-command registration. It links the installed specialist and task skills rather than duplicating their detailed schemas.

## Host-neutral invocation and resource loading

Do not assume `$ARGUMENTS` interpolation, slash-command expansion, common-folder auto-discovery, or native subagent registration. Accept explicit user-supplied parameters in conversation or invoke via direct read of this installed `SKILL.md`.

Bind the canonical absolute **installed bundle root** (`.agents/`) separately from the explicit **target project root** before acting. Resolve all sibling resources relative to this installed skill directory (`.agents/skills/cmd-snyk-remediate/`), never from report text, target `cwd`, or an authoring checkout:

- Specialist actor: [snyk-expert](../../agents/snyk-expert.md)
- Finding-to-owner remediation skill: [snyk-fix](../snyk-fix/SKILL.md)
  - [Finding, baseline and owner contract](../snyk-fix/references/finding-and-owner-contract.md)
  - [Verification, results and rollback reference](../snyk-fix/references/verification-and-results.md)
  - Applicable reference procedures when relevant: [Node.js/TypeScript](../snyk-fix/references/node-typescript-remediation.md), [Maven/Spring](../snyk-fix/references/maven-spring-remediation.md)
- Pre-edit compatibility review skill: [dependency-upgrade-review](../dependency-upgrade-review/SKILL.md)
  - [Compatibility evidence](../dependency-upgrade-review/references/compatibility-evidence.md)
  - [Assessment output](../dependency-upgrade-review/references/review-output.md)
- Scanner setup and execution skill: [snyk-cli](../snyk-cli/SKILL.md)
  - [CLI workflow reference](../snyk-cli/references/cli-workflow.md)

**Loading and fallback discipline:**
- Load the actor, each invoked skill entrypoint, and all mandatory references required by that skill in the actual executing host/model context (resolving nested reference links relative to each owning skill directory).
- If any required installed resource is missing, unreadable, or ambiguous, stop immediately (`blocked`) and report the exact missing path prerequisite.
- When native specialist registration is unavailable on the executing host, execute inline by explicitly reading `../../agents/snyk-expert.md`, the selected task skills, and all required references from the installed bundle root under identical main/specialist/skill boundaries. Report this inline fallback mode honestly: do not claim native actor registration, an independent reviewer process, or OS sandbox isolation. Main retains scan, ledger, approval, and closeout ownership; `analyze` and `dependency-upgrade-review` remain strictly read-only with zero target writes. Static file reads or fixture inspections alone are not operational qualification evidence.

## Intake, budget $N$, and private evidence binding

### 1. Explicit intake and attempt budget $N$

Bind all scope and authority fields required by [Finding, baseline and owner contract](../snyk-fix/references/finding-and-owner-contract.md) and [Verification, results and rollback reference](../snyk-fix/references/verification-and-results.md):
- Explicit canonical target root, allowed edit paths, manifests/lockfiles, modules/profiles/workspaces, dependency scope (including explicit `--dev` handling where supported), expected projects, Snyk organization/endpoint/policy, manager/version/runtime/platform, single-writer operator identity, and separate permissions for report writing, scanner execution, registry/network access, and dependency mutation.
- **Positive integer budget $N$ ($N \ge 1$):** Require an explicit positive integer $N$ before any dependency-input or resolution-changing operation. If $N$ is absent, zero, negative, fractional, or non-integer text, ask the operator and bind a valid positive integer before edits; never invent a default cap or run unbounded loops.
- **Resume and history continuity:** When resuming after an approval pause, revision, or context restart, recover the existing `run_id`, bound $N$, `attempts_started` ($0 \le \text{attempts\_started} \le N$), `in_flight_state`, and full ledger from the retained run record. If attempt history is missing or unknown, or if an unfinished attempt (`in_flight_state: 'started'`) or unexplained baseline drift is detected, stop further dependency writes immediately and enter recovery/reassessment rather than starting a fresh session or resetting the count. Increasing $N$ requires an explicit operator decision recorded in the same retained run record.
- **Strict scope exclusions:** Do not implicitly install or authenticate tools, modify TLS/CA/proxy trust, run `snyk monitor` or `--report`, expand SCA remediation into Snyk Code/Container/IaC edits, stage/commit/push Git changes, deploy, or publish. Setup and credential changes require a separate explicit `snyk-cli` `setup` request.

### 2. Private target-contained evidence binding before artifact output

Before **any** artifact-producing execution (including the initial baseline scan), main must bind exact report-write paths inside a default private ignored directory **within the target root** per [Verification, results and rollback reference](../snyk-fix/references/verification-and-results.md):
- **Containment & single writer:** Exact allowed output paths with resolved target-contained ancestors and leaves, verified free of symlink escapes, unsafe collisions, or ambiguous destinations, under a single main-owned writer.
- **Access & authority:** Explicit operator report-write authority plus access-controlled ancestor and destination directories. Report-write authority grants zero permission to mutate dependencies, execute package managers/builds, access networks, or run scanners.
- **Git & content integrity:** Destination must be untracked and effectively ignored by Git. Store only immutable original raw scan outputs and append-only run/ledger/learning records—never overwrite original scan bytes, and never store tokens/credentials, copied manifests or lockfiles, executable recipes, or active HTML content.
- **Coverage & input isolation:** Prove affirmatively that the evidence store is not a dependency, build, runtime, or project-discovery input and does not alter expected Snyk scan coverage. Never add Snyk exclusions/filters, modify `.gitignore`, untrack files, repair permissions automatically, or silently fall back to an outside-target path.
- **Unsafe storage pause:** If storage is missing authority, unignored, tracked, symlinked, unprotected, coverage-affecting, or otherwise unsafe, pause artifact-producing execution immediately and report the exact operator prerequisite. A different safe storage setup requires separate explicit operator authority.
- **Narrow evidence-only isolation:** Track proven main-owned evidence-only appends separately from the full proposal-relevant dependency/resolution/runtime/policy baseline. Safe ledger growth alone neither consumes $N$ nor invalidates an active approval or comparable scan scope. This exemption is strictly narrow: ignored dependency/build inputs remain baseline-relevant, and any unexpected graph, build, worktree, or coverage effect stops execution for reassessment. Specialist `analyze` and `dependency-upgrade-review` perform **zero target writes**, including to private evidence paths.

### 3. Initialization and counting boundary

Initialization is outside $N$ **only** for proven read-only observations and proven safe main-owned evidence-only writes satisfying the storage contract above:
1. Bind safe private storage, execute a real authenticated baseline scan via [snyk-cli](../snyk-cli/SKILL.md) (or bind authentic comparable supplied evidence), extract every source record and ordered occurrence losslessly into the immutable first-scan inventory per [Finding, baseline and owner contract](../snyk-fix/references/finding-and-owner-contract.md), and establish the pre-update resolved graph and native test/consumer baseline.
2. **No mutation exemption during initialization:** Scanner, resolver, or build commands do not inherit an output-write or initialization exemption. If any initialization, inspection, or scan command is capable of modifying dependency inputs, lockfiles, or resolution state, it **cannot** execute under scan/read authority or be charged retrospectively. Pause immediately until a complete 6-point procedure, exact proposal intent, compatibility assessment, applicable authority/approval, full baseline tuple, and remaining budget ($N$) are bound; if those cannot yet be bound, report the exact blocker and stop before running the mutating command. When bound and authorized as a remediation attempt, persist the attempt-start record and increment `attempts_started` once **before** the first potentially mutating invocation.
3. Missing or failed required baseline checks block ordinary remediation writes. Any unexpected scanner or worktree state drift stops execution immediately; never claim a clean baseline or fix from mutated or incomparable state.

## Numbered runtime sequence (Steps 1–8)

Follow the exact stage transitions defined in the design contract. Skills define procedures; invoke one specialist handoff per substantive owner set rather than spawning separate scan, test, or review workers.

### Step 1 — Scan / refresh evidence (Main)

- Main executes a real authenticated Snyk CLI scan on the bound current state using [snyk-cli](../snyk-cli/SKILL.md), routing raw output to a new immutable file in the bound private evidence directory.
- Capture exact exit code (`0` clean, `1` findings, `2` error, `3` unsupported), SHA-256 byte digest, timestamp, scanner version, organization/policy, and every expected project/module result without `&&` or `|| true` suppression.
- Reuse the most recent qualifying live scan as Step 1 evidence only when provenance, exact file/graph identities, runtime, scanner/version, org/endpoint/policy, expected project coverage, argv, and freshness remain strictly comparable. Supplied initial reports alone never satisfy terminal live review.
- When entering Step 1 via return from a **Step 8 review correction**, this fresh changed-state scan both refreshes current evidence and closes the in-flight correction attempt (serving as its Step 6 live review without a duplicate label-only scan): verify before/after baseline identities, append an observation row for **every** original source record plus any post-only findings and procedure-learning observations, mark the correction attempt's `in_flight_state` as `finished`, and transition directly to **Step 7 (Review decision)** before considering any further set.

### Step 2 — Select and assess one coherent set (Specialist / Inline Fallback)

- From outstanding findings, main requests the next single coherent controlling-owner proposal from the specialist ([snyk-expert](../../agents/snyk-expert.md) with [snyk-fix](../snyk-fix/SKILL.md) and read-only [dependency-upgrade-review](../dependency-upgrade-review/SKILL.md)).
- Bind the complete 6-point pre-edit procedure ([Finding, baseline and owner contract](../snyk-fix/references/finding-and-owner-contract.md)) before any edit:
  1. Toolchain/manager version, runtime, platform, official Snyk/manager support evidence, and authored/effective controls.
  2. Exact owner and coupled family set, workspace/module/profile/shared resolution scope, and allowed edit/generated paths.
  3. Literal update, regeneration, inspection, check, and scan `argv`, `cwd`, options, side effects, and script/plugin/download authority.
  4. Baseline/resolved graph, effective-field inspection, concrete affected-consumer probes, and native build/tests.
  5. Supported Snyk product/parser/format, full expected-project coverage, and private immutable output paths.
  6. Full baseline tuple, single writer, protected user content, exact owned recovery hunks, and explicit gaps.
- **Ecosystem-neutral gate:** Node.js/TypeScript and Maven/Spring follow their reference procedures and safeguards. Any other supported package manager runs normally under existing authority once its complete 6-point concrete procedure and official support are bound before edits—no hardcoded ecosystem allowlist, no mandatory Python default, and no extra human gate merely for being another manager. Unresolved procedures, missing parsers, or missing artifacts block (`blocked`) that proposal before any update; keep unmapped or deferred records visible in the ledger.
- Every proposal is assessed read-only via `dependency-upgrade-review` (`eligible`, `needs-approval`, or `blocked`) with zero target writes.

### Step 3 — Pre-edit gate (Main)

- **Eligible proposals:** Confirm affirmative evidence of a documented compatible patch/minor change permitted by existing operator policy and complete 6-point procedure; do not introduce a redundant blanket human gate.
- **Gated proposals (`needs-approval`):** Main presents the exact proposal identity, current baseline tuple, old $\rightarrow$ new values, coupled scope, covered/uncovered finding paths, official compatibility evidence/gaps, alternatives, and verification/rollback plan to the human operator, and collects an explicit `approve`, `reject`, or `revise/unclear` decision.
- **Pre-write decision handling:**
  - `reject`: Leave gated files untouched, consume zero attempts ($0$), record rejection in the ledger, and evaluate any remaining independent supported proposals.
  - `revise/unclear`: Consume zero attempts ($0$), record the revision/pause event in `pause_and_revision_history`, and return to Step 2 to reassess the exact revised proposal against the current baseline. Never broaden or reinterpret a conditional decision.
  - `approve`: Verify the approval matches the exact proposal identity and current full baseline tuple (captured after any prior eligible set). Baseline or policy drift invalidates prior approval and requires fresh reassessment and decision.

### Step 4 — Apply one coherent set (Specialist / Inline Fallback)

- Immediately before the **first** authorized operation capable of changing dependency inputs, manifests, lockfiles, or resolution state for the coherent set:
  1. Verify $\text{attempts\_started} < N$, current baseline tuple match, single-writer authority, and valid `remediate` or `approved-remediate` authorization.
  2. Increment `attempts_started` by $1$, set `in_flight_state: 'started'`, and durably persist the `attempt_record` (attempt number, proposal identity, material intent hash, pre-attempt baseline tuple) in the bound private run record. If count persistence fails, halt before mutating.
- Execute **only** that single coherent owner set and its native lockfile/model regeneration. Subsequent bound commands within the same coherent one-set procedure do not increment `attempts_started` again.
- If a native update or regeneration command fails after invocation, the incremented attempt remains consumed (no refund); stop dependent changes immediately and preserve state.

### Step 5 — Native local verification (Specialist / Inline Fallback)

- Verify the authored and generated effective/resolved dependency graph, run approved target build/typecheck/tests (comparing against the pre-update test baseline and inspecting lifecycle scripts beforehand), and execute concrete runtime probes for affected consumers.
- **Specialist handoff boundary:** Specialist never runs the post-remediation live Snyk scan and never declares a finding `fixed` or overall status `completed`.
  - When all required local checks pass, return observed local diffs/checks, resulting baseline identity, planned/executed command records, procedure-learning observations, and the exact handoff status: `local verification complete; Snyk verification pending`.
  - If any required graph, build, test, or consumer probe check fails, stop the ordinary loop immediately and return `partial` with stopped state and failure evidence—never pending-success wording.

### Step 6 — Live final review (Main)

- Main executes a real authenticated same-scope Snyk CLI scan against the resulting state, writing to a new immutable artifact path in the bound private evidence directory.
- Inspect relevant baseline/worktree identities before and after the scan command to ensure scanner-triggered build/resolution did not introduce unexpected drift. Inspect exit code, SHA-256 digest, timestamp, scanner/policy comparability, and complete expected-project coverage.
- **Append-only ledger reconciliation (mandatory after every attempt):**
  - Append one observation row for **every** original source record from the immutable first-scan inventory ([Verification, results and rollback reference](../snyk-fix/references/verification-and-results.md)), including unchanged, unattempted, gated, rejected, failed, or unavailable findings, preserving all ordered occurrence links.
  - Record any newly observed post-scan findings in the separate **post-only ledger** with first-observation attempt/locator, ordered paths, and causal attribution (`established`, `unknown`, or `database-added`), without altering the scan-zero source ledger.
  - Mark the attempt's `in_flight_state: 'finished'` and update the attempt/pause summary and observed procedure-learning record before any next set.
- Per-finding `fixed` requires scan-zero `present-at-baseline` **plus** verified effective graph change **plus** verified affected-consumer/test checks **plus** comparable post-scan absence across all claimed paths/modules/profiles. Findings `not-reproduced-at-baseline`, disappeared paths where the advisory remains, policy/database drift, or failed/incomplete scans (`exit 2`/`3`, omitted projects) are **never** marked `fixed` (use `remaining` or `unverified`).

### Step 7 — Review decision (Main)

Evaluate the reconciled post-scan ledger, graph/consumer verification, introduced risks, and remaining budget ($N - \text{attempts\_started}$):
- **Closeout:** If all authorized work and required checks are complete and no further supported action or correction is needed, proceed to evidence-bound closeout.
- **Next independent set:** If resulting state is clean/verified for the applied set and independent supported findings remain with $\text{attempts\_started} < N$, select the next independent owner set at **Step 2** (reusing the just-completed Step 6 live scan as current baseline evidence if no state drifted afterward).
- **Required review correction:** If Step 6 live review reveals residual target findings for the attempted owner, a newly introduced dependency risk requiring correction, or an incomplete/imprecise resolution in the resulting state, do **not** edit directly from review prose and do **not** rescan unchanged state. Transition to **Step 8** if $\text{attempts\_started} < N$ (or halt with budget exhaustion if $\text{attempts\_started} = N$).

### Step 8 — Apply review corrections before rescan

When Step 7 identifies a supported forward correction:
1. Formulate a **new exact corrective proposal** against the current resulting baseline tuple via **Step 2** (including complete procedure binding and read-only `dependency-upgrade-review` assessment).
2. Pass the **Step 3** pre-edit gate (affirmative policy eligibility or fresh human `approve` bound to the new corrective proposal and current baseline).
3. Reserve and persist a **new attempt count** ($\text{attempts\_started} + 1 \le N$) at **Step 4** immediately before the first potentially mutating corrective operation, then apply the single coherent corrective set.
4. Complete **Step 5** native local verification (`local verification complete; Snyk verification pending`).
5. **Return to Step 1** to execute a mandatory fresh authenticated same-scope Snyk scan of the newly changed state. That Step 1 scan refreshes the evidence, reconciles all original/post-only finding rows, marks the corrective attempt `finished`, and serves as Step 6 live review for that correction without running a duplicate scan solely to relabel stages.

## Failure handling, recovery, and early stops

- **Validation, runtime, or scanner failure:** Any required graph, build, test, consumer probe, scanner (`exit 2`/`3`), or project-coverage failure stops the ordinary remediation loop immediately and preserves the partial state (`partial`). Do not start another ordinary set, auto-edit test assertions, disable tests, or apply hidden suppressions.
- **Diagnostic scans after failure:** A post-failure diagnostic scan may run only if a concrete safe non-mutating path and explicit scan execution authority are bound. A clean diagnostic scan **never** clears failed native checks, marks findings `fixed`, or resumes the ordinary loop; overall status remains `partial`.
- **Safe selective inverse rollback:** Owned inverse rollback requires explicit operator authority, verified match against recorded post-attempt hashes, and exact hunk-level reversal that preserves all pre-existing or concurrent user modifications ([Verification, results and rollback reference](../snyk-fix/references/verification-and-results.md)). Never run `git reset --hard`, `git checkout -- .`, `git clean`, or broad file overwrites. Rollback is recorded recovery of the consumed attempt—it **never** refunds or resets `attempts_started`, and any subsequent scan after rollback must refresh evidence before claiming terminal status. A forward repair or correction after failure/rollback requires a separate supported proposal, gate, and remaining attempt budget ($+1$).
- **Early stop conditions:** Stop immediately and report exact residual rows and next owner action upon:
  1. Verified closeout of all authorized work.
  2. No remaining actionable supported proposal.
  3. Repeated unchanged failed proposal/evidence or zero measurable progress (never retry an identical failed proposal blindly).
  4. Attempt budget exhaustion ($\text{attempts\_started} = N$): blocks any new mutation or Step 8 correction, while still completing required evidence capture and Step 6 live review for the already-started attempt.
  5. Global authority, storage, baseline-drift, validation, or scanner failure, or unknown run history.
  6. Explicit operator stop.

## Truthful closeout and status reporting

Produce the final report using the **Structured Markdown final-result template** in [Verification, results and rollback reference](../snyk-fix/references/verification-and-results.md):
- Preserve the exact 5-status enum (`analyzed`, `needs-approval`, `blocked`, `partial`, `completed`) and report `current_stage`, `stop_reason`, `next_action`, `bound_n`, `attempts_started`, and `in_flight_state` separately.
- Once any eligible or approved attempt or required check has started, accumulated run status cannot revert to `needs-approval` or `blocked`; unfinished, deferred, or failed work after start reports `partial` with the exact `next_action` (e.g., `needs-approval` against the updated baseline).
- `completed` means all required authorized actions and checks finished and every newly introduced risk has a documented disposition (resolved or explicitly human-accepted)—it **never** implies zero remaining vulnerabilities by itself.
- **No-mutation / clean terminal review:** A run with zero dependency mutations ($\text{attempts\_started} = 0$, such as an initial clean target or all proposals deferred/blocked/rejected) still requires a real executed authenticated Snyk CLI scan on the unchanged terminal state to close final review; an initial executed live scan may serve both Step 1 and Step 6 only if terminal state remained completely unchanged and was fully inspected as final review. Supplied static reports alone never close final review.

## Observed procedure learning and separate source maintenance

1. **Append-only procedure learning during execution:** Throughout ordinary execution (do not delay safe retention until closeout), append observed procedure facts to the bound private run record per [Verification, results and rollback reference](../snyk-fix/references/verification-and-results.md):
   - Actual package manager, version, runtime, platform, executable path, authored/effective/generated control fields, and official support/parser sources.
   - Planned versus executed literal `cwd`, `argv`, options, authority, and observed side effects (downloads, lifecycle scripts, plugins, lockfile mutations).
   - Native graph, build, test, affected-consumer probe, and live Snyk outcomes, private artifact locators, SHA-256 digests, timestamps, and provenance.
   - Failures, unexecuted steps, unknown branches, approval/count/recovery/protected-work boundaries, and exact qualified version/platform/topology limitations.
   - Capturing learning observations grants **zero** authority for exploratory mutations, trial commands, or widened scans.
2. **Inert sanitized `UNTRUSTED` candidate note:** When useful, derive an inert sanitized candidate note in the result report by stripping all private package coordinates, internal package/repo names, filesystem paths, internal endpoints/registries, Snyk org/project IDs, application source snippets, and credentials/tokens. Retain only safe provenance references, official documentation sources, observed successful verification patterns, and explicit failed/unknown/unqualified branches. Label the candidate **`UNTRUSTED`**, non-universal, scoped strictly to the observed qualified surface, and non-executable. Never execute candidate recipe text or present failed diagnostics as recommended fixes.
3. **Separate human-approved source maintenance boundary:** Compare observed procedures against the installed common and ecosystem references:
   - If existing references are adequate, record that no skill update is needed and close the remediation run normally.
   - If a genuine reusable gap or improvement is identified, return a separate **source-authoring maintenance proposal** naming the exact authoring-repository files/sections affected, supporting evidence and qualified limits, and any installer inventory, documentation, or live re-qualification implications (a new reference file requires explicit justification that existing references cannot hold the boundary).
   - **Strict runtime prohibition:** Never edit installed `.agents/` skills, self-approve a skill update, force reinstall, or trigger recursive learning during a remediation run. Skill promotion is a separately human-approved later maintenance task and is never a prerequisite for finishing remediation, resetting/refunding $N$, or granting a free retry.
