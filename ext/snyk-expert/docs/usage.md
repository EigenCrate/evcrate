# Snyk expert: common `.agents` bundle

## Install

The package installs portable instructions, not Snyk itself. Run the installer from this checkout or via npx:

```bash
# Preview installation from this repository/checkout:
node ext/snyk-expert/bin/install.js --target agents --directory /path/to/project --dry-run

# Execute installation from this repository/checkout:
node ext/snyk-expert/bin/install.js --target agents --directory /path/to/project

# Or run from the unpacked package root:
node bin/install.js --target agents --directory /path/to/project

# Or via npx (when available locally or from a configured registry):
npx @evcrate/snyk-expert --target agents --directory /path/to/project
```

Installation options:
- `--target agents` (required): Installs the explicit 12-asset bundle into `<project-root>/.agents/`.
- `--directory <path>` (required): Explicit canonical path to the consuming project root.
- `--dry-run`: Previews planned additions, replacements, and unchanged files without writing to disk.
- `--force`: Authorizes replacing conflicting pre-existing files; requires interactive confirmation or `--yes`.
- `--yes`: Confirms overwrite when paired with `--force` (rejected if passed alone without `--force`).

### Installation Safety Guarantees & Operating Boundary

- **Trusted Exclusive Writer Boundary:** Preflight symlink and collision checks defend against misconfigurations. The installer assumes trusted exclusive access to the target tree; concurrent external writers or in-flight directory swaps are outside the installer's boundary.
- **Process Locking & Stale Lock:** Cooperating installer processes acquire `.install.lock` in `<project-root>/.agents/` to prevent concurrent writes. If an installer is terminated abruptly, verify no installer process is active before manually removing `.install.lock`.
- **Pre-execution Drift Checks:** Verifies destination file contents against the planning phase before writing; fails closed without modifying destination if drift is detected.
- **Staged Temporary Files & Best-Effort Rollback on Error:** Files are staged to temporary files (`.tmp-<uuid>`) in destination directories and published per file. On failure, temporary files are pruned, replaced file backups are restored on a best-effort basis, and newly created files are removed.
- **Symlink Defense:** Rejects destination paths that escape the target root or resolve to symlinked leaves. Pre-existing unrelated files are preserved untouched.

## Bundle Structure and Host Loading

```text
<project-root>/
└── .agents/
    ├── agents/
    │   └── snyk-expert.md
    └── skills/
        ├── cmd-snyk-remediate/
        │   └── SKILL.md
        ├── snyk-cli/
        │   ├── SKILL.md
        │   └── references/
        │       └── cli-workflow.md
        ├── snyk-fix/
        │   ├── SKILL.md
        │   └── references/
        │       ├── finding-and-owner-contract.md
        │       ├── maven-spring-remediation.md
        │       ├── node-typescript-remediation.md
        │       └── verification-and-results.md
        └── dependency-upgrade-review/
            ├── SKILL.md
            └── references/
                ├── compatibility-evidence.md
                └── review-output.md
```

### Distinction: Target Project Root vs. Installed Bundle Root

- **Target project root (`target_root`):** The repository or directory being scanned and remediated (e.g. `/path/to/project`).
- **Installed bundle root (`installed_bundle_root`):** The directory housing the installed `.agents` tree (e.g. `/path/to/project/.agents`).

A host supporting `.agents/skills` discovers skills according to its own contract. When native specialist or command registration is unavailable, the executing model explicitly reads the coordinator, specialist, selected task skills, and required references from the installed bundle root.

### Explicit-Read Inline Fallback Template

```text
Executing host: Explicit-read inline fallback mode.
Target project root: /path/to/project
Installed bundle root: /path/to/project/.agents
Coordinator: /path/to/project/.agents/skills/cmd-snyk-remediate/SKILL.md
Specialist: /path/to/project/.agents/agents/snyk-expert.md
Selected task skill: /path/to/project/.agents/skills/snyk-fix/SKILL.md
Required references:
  - /path/to/project/.agents/skills/snyk-fix/references/finding-and-owner-contract.md
  - /path/to/project/.agents/skills/snyk-fix/references/verification-and-results.md
  - /path/to/project/.agents/skills/snyk-fix/references/node-typescript-remediation.md
Execution mode note: Running inline fallback honestly (no native subagent registration, no independent reviewer, no OS sandboxing).
```

## Bounded Remediation Coordinator (`cmd-snyk-remediate`)

`cmd-snyk-remediate` is a main-owned portable procedure coordinating bounded review and correction loops across Node.js, Maven, and other supported package managers.

### Coordinator Invocation Template

```text
Command: cmd-snyk-remediate
Target project root: /path/to/project
Installed bundle root: /path/to/project/.agents
Baseline tuple: <commit-sha, manifest-hash, lockfile-hash>
Attempt budget (N): 2 (positive integer >= 1)
Package manager / runtime / platform: npm 10.8.2 / Node.js 22.19.0 / linux-x64
Scope: Open Source (SCA)
Expected projects: package.json (root), packages/core/package.json
Organization / endpoint: my-org / https://api.snyk.io
Policy file / dev dependencies: .snyk / include dev
Private evidence directory: <project-root>/<private-ignored-evidence-dir> (untracked, git-ignored)
Pre-edit procedure: Complete 6-point binding verified
Authority boundaries:
  - Report authority: Bound private evidence writes only (no scan/network/dependency rights)
  - Scanner authority: Same-scope authenticated CLI execution
  - Dependency authority: Single-writer operator; explicit human gate on breaking/major changes
```

### 8-Stage Runtime Workflow

1. **Step 1 — Scan / Refresh Evidence (Main):** Executes real authenticated Snyk CLI scan (`snyk test --json`) storing output in the bound private evidence directory. On loop return from Step 8, refreshes scan evidence, closes the in-flight corrective attempt (`in_flight_state: 'finished'`), reconciles original and post-only ledgers, and transitions directly to Step 7 without duplicate label-only scans. Real terminal CLI execution is required even on zero-mutation runs; supplied reports or token presence alone do not close review.
2. **Step 2 — Select and Assess One Coherent Set (Specialist / Inline):** Evaluates pre-edit 6-point concrete procedure binding (manager/version, scope boundary, literal commands/authority, graph/consumer checks, Snyk coverage, safety/recovery). Performs read-only `dependency-upgrade-review` with zero target writes.
3. **Step 3 — Pre-edit Gate (Main):** Verifies policy-eligible patch/minor evidence or collects operator decision (`approve` / `reject` / `revise`). Rejections and revisions consume zero ($0$) attempts.
4. **Step 4 — Apply One Coherent Set (Specialist / Inline):** Confirms $\text{attempts\_started} < N$, increments `attempts_started` by 1 with `in_flight_state: 'started'` before the first operation capable of mutating dependency inputs or resolution state, and applies only the reviewed coherent owner set.
5. **Step 5 — Native Local Verification (Specialist / Inline):** Executes native lockfile/graph checks, compiler/build checks, and affected-consumer runtime probes. Returns `local verification complete; Snyk verification pending` (or halts ordinary loop at `partial` on failure).
6. **Step 6 — Live Final Review (Main):** Executes fresh authenticated same-scope Snyk scan on resulting state after passing Step 5. Reconciles all original source rows and post-only findings, records procedure learning, and marks `in_flight_state: 'finished'`.
7. **Step 7 — Review Decision (Main):** Evaluates reconciled ledgers, residual risks, and remaining budget ($N - \text{attempts\_started}$) for closeout, next independent set (Step 2), or required review correction (Step 8).
8. **Step 8 — Apply Review Corrections Before Rescan:** Formulates exact corrective proposal against resulting baseline, passes read-only exact-candidate assessment (Step 2), approval (Step 3), and counter persistence plus corrective application (Step 4, with $\text{attempts\_started} + 1 \le N$ and `in_flight_state: 'started'`), completes native local verification (Step 5), and returns to Step 1 for fresh changed-state scan before Step 7.

### Attempt Counting, Budget $N$, and Resume Safety

- **Positive Integer Budget:** $N \ge 1$ bound explicitly at intake.
- **Count Before Mutation:** `attempts_started` increments once immediately before the first operation capable of mutating dependency inputs or resolution state.
- **Subsequent Commands:** Subsequent commands within the same reviewed set do not increment the count again.
- **Zero Refunds:** Failures, compiler errors, and rollbacks consume the attempt; no refunds or resets.
- **Evidence-Only Writes:** Proven, narrow, main-owned evidence-only writes strictly outside $N$; ledger growth alone consumes no attempts and does not invalidate approvals or scan comparability.
- **Clean Run Zero Attempts:** Runs without dependency mutations complete with $\text{attempts\_started} = 0$.
- **Resume Recovery:** Restarts recover `run_id`, $N$, `attempts_started`, and verify `in_flight_state`. If `started` on crash resume, stop writes, assess unverified changes against the pre-attempt baseline tuple, and require explicit operator authority and hunk-level reversal before recovery; if `finished` or `idle`, verify current baseline against recorded state before proceeding.

### Overall Status and Finding Dispositions

- **Overall Status Precedence:** Evaluated by condition precedence:
  1. `analyzed`: Read-only analysis completed with zero target writes.
  2. `needs-approval`: Concrete proposal ready, awaiting human decision; zero gated writes executed.
  3. `blocked`: Missing prerequisite prevents execution from starting.
  4. `partial`: Work started or subset applied, but subsequent work deferred, failed, or incomplete.
  5. `completed`: All authorized actions and checks complete; every new risk documented. `completed` does not mean zero findings by itself.
- **Remediation vs. Path Disappearance:** A finding is `fixed` only when supported by effective graph inspection, native affected-consumer checks, and comparable fresh Snyk absence. A pruned or filtered dependency path alone is never credited as fixed.

## Private Target-Contained Evidence Storage Safeguards

Raw scans, run ledgers, and procedure observations default to an operator-bound private ignored directory inside the target root (`target_root`):
- **Containment:** Canonical resolved ancestors and leaves within target root; no symlink escape or ambiguous paths.
- **Access:** Explicit report-write authority; access-controlled destination directory. Report-write authority grants no dependency mutation, scanner execution, or network transmission rights.
- **Git Ignore:** Evidence directory must be untracked and effectively ignored in `.gitignore`. An ignored path is not an exemption for ignored dependency or build inputs.
- **Content:** Immutable original scan bytes and append-only ledgers; no credential material, tokens, copied manifests, or executable recipes.
- **Coverage:** Storage must not act as a build/runtime input or alter scanner discovery. No Snyk exclude rules used to conceal evidence.
- **Unsafe Storage Pause:** If storage is tracked, unignored, unauthorized, or coverage-affecting, pause artifact execution immediately and report operator prerequisite. Pausing means NO automatic ignore edits, untracking, or permission modifications.

## Illustrative Abbreviated Ledger Templates

*Illustrative abbreviated templates with placeholder identifiers only. Authoritative complete lossless schemas with source artifact/record locators, raw-field hash bases, module/profile distinctions, and coverage/unknown states are defined in [finding-and-owner-contract.md](../.agents/skills/snyk-fix/references/finding-and-owner-contract.md) and [verification-and-results.md](../.agents/skills/snyk-fix/references/verification-and-results.md). Runtime execution records genuine observed findings, full dependency edges, and exact locators without fabricating IDs.*

### 1. Immutable First-Scan Source Inventory

| source_finding_id | package_name | introduced_through | severity | advisory_url | title | scan_zero_presence |
|---|---|---|---|---|---|---|
| EX-PKG-001 | sample-pkg-a | root > dep-b > sample-pkg-a | high | https://snyk.io/vuln/example-001 | Prototype Pollution | present-at-baseline |
| EX-PKG-002 | sample-pkg-b | root > dep-c > sample-pkg-b | medium | https://snyk.io/vuln/example-002 | ReDoS | not-reproduced-at-baseline |
| EX-PKG-003 | sample-pkg-c | root > dep-d > sample-pkg-c | low | https://snyk.io/vuln/example-003 | Denial of Service | present-at-baseline |

*Note: The immutable source inventory captures supplied report assertions; authentic scan-zero presence distinctions (`present-at-baseline`, `not-reproduced-at-baseline`, `incomparable`, `failed/unavailable`, `unknown`) are initialized upon binding authentic baseline scan evidence. Findings marked `not-reproduced-at-baseline` are never credited as fixed.*

### 2. First-Scan Occurrence Ledger

| occurrence_id | source_finding_id | package_name | full_dependency_path | introduced_via_manifest | direct_dependency |
|---|---|---|---|---|---|
| OCC-001 | EX-PKG-001 | sample-pkg-a | app > dep-a@1.0.0 > sample-pkg-a@1.2.0 | package.json | dep-a@1.0.0 |
| OCC-002 | EX-PKG-001 | sample-pkg-a | app > dep-b@2.0.0 > sample-pkg-a@1.2.0 | package.json | dep-b@2.0.0 |
| OCC-003 | EX-PKG-002 | sample-pkg-b | app > dep-c@2.0.0 > sample-pkg-b@1.1.0 | package.json | dep-c@2.0.0 |
| OCC-004 | EX-PKG-003 | sample-pkg-c | app > dep-d@1.5.0 > sample-pkg-c@2.0.0 | package.json | dep-d@1.5.0 |

### 3. Every-Attempt Observation Ledger

After every started attempt ($1 \dots \text{attempts\_started}$), including failed or rolled-back attempts, append an observation row for every original finding from the immutable first-scan inventory—including unchanged, unattempted, gated, or rejected findings (proposals rejected before execution consume zero attempts). When native local verification fails, record unavailable scans and unverified outcomes rather than executing an unsafe scan:

| attempt_number | source_finding_id | baseline_observation | post_scan_observation | native_check_status | disposition | evidence_sha256 |
|---|---|---|---|---|---|---|
| 1 | EX-PKG-001 | present-at-baseline | absent | pass (graph + tests) | fixed | <sha256-hash-placeholder> |
| 1 | EX-PKG-002 | not-reproduced-at-baseline | absent | unverified | unverified | <sha256-hash-placeholder> |
| 1 | EX-PKG-003 | present-at-baseline | present | not-attempted | remaining | <sha256-hash-placeholder> |

### 4. Separate Post-Only Findings Ledger

Findings appearing exclusively in post-scans or scanner database additions are recorded in a separate ledger:

| attempt_number | new_finding_id | package_name | attribution | native_evidence | disposition |
|---|---|---|---|---|---|
| 1 | EX-PKG-NEW-001 | dep-introduced-pkg | established causal link (direct update) | graph + runtime | newly-introduced |

### 5. License Decision Ledger

License considerations are separate human policy decisions, never vulnerability remediation:

| license_finding_id | package_name | license_type | policy_rule | human_decision | decision_timestamp |
|---|---|---|---|---|---|
| LIC-SAMPLE-001 | some-pkg | GPL-3.0 | restricted | approved-exception | 2026-10-13T00:00:00Z |

### 6. Durable Run Record & Attempt Summary

| run_id | target_root | bound_n | attempts_started | current_stage | in_flight_state | overall_status |
|---|---|---|---|---|---|---|
| run-sample-01 | /path/to/project | 2 | 1 | Stage 7 (Review Decision) | finished | partial |

## Procedure Learning & Candidate Recipes

- **Append-Only Learning Observations:** Observed manager commands, effective controls, planned vs. executed literal argv/options, side effects, outcomes, and qualified boundaries are recorded in the run record.
- **Inert Sanitized Candidate Note:** When useful, Main derives an inert `UNTRUSTED` candidate recipe note. All private paths, credentials, package coordinates, and endpoints are stripped.
- **No Automatic Skill Mutation:** Candidate notes are strictly inert documentation. They are not executable, do not modify installed `.agents` skills, and do not trigger automatic skill promotion or reinstallation. Skill updates are handled as separate human-approved source repository maintenance.

## Qualification and Operational Boundaries

The package supplies portable instructions, coordinator workflows, and a local installer. It supplies no credentials, target tokens, network permissions, or OS isolation sandboxes.
- **Snyk CLI Executable & Auth:** Real authenticated scans require Snyk CLI on `$PATH` and active authentication (`snyk auth` or `SNYK_TOKEN`).
- **Target Independence:** Tests and evaluations within `ext/snyk-expert` prove packaging, specification compliance, and delivery contracts; they do not constitute live operational qualification of external targets.
- **Phase 07 Operational Status:** Live operational qualification across real targets remains blocked on operator prerequisites (PREREQ-01..03, PREREQ-05, PREREQ-06, PREREQ-08; PREREQ-07 unvalidated). Phase 08 establishes verified documentation, contracts, and delivery baseline.
