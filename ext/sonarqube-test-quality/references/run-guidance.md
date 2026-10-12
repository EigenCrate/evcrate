# Sanitized Run Guidance, Privacy Redaction, and Promotion Policy

This reference is the single authoritative policy owner for privacy boundaries, redaction placeholders, provenance and confidence ceilings, and owner-reviewed promotion of run guidance across SonarQube remediation cycles.

## 1. Dual-Artifact Privacy Architecture

Remediation runs produce two strictly separated artifacts to maintain evidence integrity while preventing data leakage:

```text
┌────────────────────────────────────────┐     ┌────────────────────────────────────────┐
│      Private Cycle Ledger & Raw        │     │         Sanitized Run Guidance         │
│             Evidence Store             │     │                 Report                 │
├────────────────────────────────────────┤     ├────────────────────────────────────────┤
│ • Complete authoritative JSON pages    │     │ • Scrubbed of all secrets and tokens   │
│ • Actual issue keys & component paths  │     │ • Generic placeholder hosts and paths  │
│ • Local absolute workspace paths       │     │ • Synthetic minimal code fixtures      │
│ • Unredacted compiler/test output      │     │ • Generalizable architectural lessons  │
│ • Retained locally under owner ACLs    │     │ • Provenance-capped confidence labels  │
│ • NEVER committed, pushed, or shared   │     │ • Any sharing requires owner approval  │
└────────────────────────────────────────┘     └────────────────────────────────────────┘
```

1. **Private Cycle Ledger & Raw Evidence Store (`<private-evidence-dir>/`):**
   - Contains verbatim SonarQube API JSON responses, `<private-evidence-dir>/resume-checkpoint.json`, actual task IDs, real file paths, and build logs.
   - Stored in a private, local evidence directory outside the repository working tree (or in an already-approved ignored location) under explicit owner access and retention controls.
   - **Strictly Private:** The populated cycle ledger and raw evidence store must **never** be committed, pushed, attached to issues/PRs, or shared.
   - Raw retention is strictly bounded: retention of logs **never** authorizes capturing plaintext credentials, tokens, or environment dumps. Secret-bearing files must **never** be hashed or stored.
2. **Sanitized Run Guidance Report:**
   - Emitted at the termination of **every** remediation run, regardless of outcome (`server-verified success`, `server-verified residual findings`, `blocked/incomplete`, `locally remediated`, `reviewed`, or `awaiting commit`).
   - Derived by transforming private run evidence through mandatory sanitization and redaction rules.
   - **Sharing Requires Owner Permission:** Any sharing of sanitized guidance—including **committing into a shared repository, pushing to a remote branch, attaching to a pull request or issue, or distributing outside the local workspace**—requires explicit repository owner permission. Automatic network transmission, background telemetry, or centralized learning-database uploads are strictly prohibited.

---

## 2. Mandatory Redaction Rules and Placeholders

All guidance reports must systematically replace sensitive identifiers with standardized placeholders. Redaction must combine structural context inspection (credential properties, HTTP headers, CLI flags, URL userinfo, token formats, and JSON/stack-trace values) with key-name matching rather than relying solely on naive substring heuristics:

| Information Category | Risk Vector | Replacement Placeholder | Rule / Behavior |
|---|---|---|---|
| **Credentials & Tokens** | Server tokens, API keys, passwords, bearer headers, URL userinfo, PEM/private keys | `<REDACTED_SECRET_TOKEN>` | Inspect structural credential contexts (`sonar.token`, `sonar.login`, `sonar.password`, `Authorization` headers, token prefixes `squ_`/`sqp_`/`sqa_`, and secret-like keys). Never log or hash secret-bearing files. |
| **Environment Variables** | Process environments, system dumps, CLI env vars | `<REDACTED_ENV_VAR>` | Never dump `env`, `printenv`, `set`, or `process.env`. Redact any captured environment variable values. |
| **Server & Host Names** | Internal corporate domains, IPs, intranet URLs, ports | `<REDACTED_SONAR_HOST>`, `<REDACTED_SERVER_URL>` | Replace real Sonar server endpoints, proxy hosts, and private IP addresses with generic placeholders. |
| **Project & Org Keys** | Sonar project keys, project names, organization/portfolio keys | `<REDACTED_PROJECT_KEY>`, `<REDACTED_PROJECT_NAME>`, `<REDACTED_ORG_KEY>` | Replace actual SonarQube project keys, display names, and organization identifiers. |
| **Issue, Task & Analysis IDs** | Server issue keys, hotspot keys, `ceTaskId`, `analysisId`, commit SHAs | `<REDACTED_ISSUE_ID>`, `<REDACTED_HOTSPOT_ID>`, `<REDACTED_TASK_ID>`, `<REDACTED_ANALYSIS_ID>`, `<REDACTED_COMMIT_SHA>` | Replace server-specific UUIDs, task identifiers, analysis keys, and real commit hashes. |
| **Repository & Remotes** | Internal Git remotes, customer repo names, org namespaces | `<REDACTED_REPO_ROOT>`, `<REDACTED_GIT_REMOTE>` | Redact repository URLs, private organization namespaces, and internal git mirrors. |
| **Branches & PR IDs** | Feature branches containing user names or internal ticket keys | `<REDACTED_BRANCH_NAME>`, `<REDACTED_PR_ID>` | Replace proprietary or ticket-identifying branch names and pull request numbers with neutral placeholders. |
| **Filesystem Paths** | Home directories, machine user names, enterprise mount paths | `<REDACTED_PROJECT_PATH>/...` | Normalize absolute paths to placeholder-rooted relative paths; scrub OS usernames and mount roots. |
| **Finding Messages & Traces** | Server issue messages or stack traces embedding proprietary symbols/paths | `<REDACTED_FINDING_MESSAGE>` | Generalize finding messages and error outputs so no proprietary class names, internal package paths, or business identifiers remain. |
| **Proprietary Source Code** | Customer business logic, proprietary algorithms, internal schemas | `<SYNTHETIC_CODE_FIXTURE>` | Strip proprietary production/test code. Illustrate patterns exclusively using minimal synthetic fixtures. |
| **Customer & Production Data** | PII, account numbers, tenant IDs, real payloads, database rows | `<REDACTED_CUSTOMER_DATA>` | Never include real customer or production payloads; replace with synthetic test values. |
| **Personal Identifiers** | Author emails, committer names, human reviewer handles | `<REDACTED_USER>`, `<REDACTED_REVIEWER_ID>` | Replace employee usernames, email addresses, commit authors, and human reviewer identifiers. |
| **Run & Guidance Slugs** | `RUN-<YYMMDD>-<slug>` and `GD-<YYMMDD>-<slug>` | Neutral descriptive `<slug>` (e.g., `cycle-01`, `resource-leak`) | Slugs must use generic technical terms; never embed project keys, internal ticket IDs, customer names, or usernames in `<slug>`. |

---

## 3. Guidance Schema and Field Definitions

Each emitted guidance document must conform to the following schema:

### 1. Metadata, Versions, and Provenance (Required)
- `guidance_id`: Unique identifier formatted as `GD-<YYMMDD>-<slug>` with a neutral `<slug>`.
- `creation_date`: ISO 8601 timestamp (`YYYY-MM-DDTHH:MM:SSZ`).
- `provenance`: Origin of the source data:
  - `synthetic`: Constructed from planning walkthroughs, template placeholders, or unexecuted mock fixtures.
  - `historical`: Extracted from archived, sanitized historical remediation reports.
  - `actual-run`: Derived from an actual executed local or server remediation cycle.
- `skill_command_actor_versions`: Exact version identifiers of `sonarqube-test-quality`, `cmd-sonar-remediate`, `sonar-evidence`, and the execution profile schema.
- `toolchain_scanner_versions`: Discovered runtime, build tool, scanner, and SonarQube server edition/version.
- `auditing_subagent_role`: Host-neutral automated role that drafted or verified the run summary (e.g., `<independent-reviewer-role>`, `<evidence-actor-role>`).
- `owner_reviewer_id`: Human repository/project owner reviewing the guidance for privacy and promotion (`<REDACTED_REVIEWER_ID>` in shared artifacts, or `pending-owner-review` before sign-off).
- `run_outcome`: Final canonical state of the originating run (`server-verified success`, `server-verified residual findings`, `blocked/incomplete`, `locally remediated`, `reviewed`, `awaiting commit`), accompanied by any halting/escalation trigger (`none`, `budget-n-exhausted`, `two-round-no-progress`, `failed-rereview`, `declined-commit`, `test-or-build-failed`, `task-failed`, `task-timeout`, `resume-checkpoint-drift`, `consistency-unknown`).

### 2. Per-Observation Confidence Classification & Provenance Ceiling (Required)
Both the guidance summary and each individual procedure step, observed failure, operational limit, and root-cause lesson must carry an explicit confidence label governed by a strict **Provenance-to-Confidence Ceiling**:

| Confidence Label | Definition | Permitted Provenance & Ceiling Rule |
|---|---|---|
| `hypothesized` | Plausible causal explanation, template placeholder, or planning walkthrough fixture not yet verified by controlled execution. | Allowed for `synthetic`, `historical`, and `actual-run`. **Mandatory ceiling for all `synthetic` planning walkthroughs and template placeholders.** |
| `observed` | Directly witnessed in compiler errors, test logs, or execution traces within a single real or historical run, without controlled before/after regression proof. | Allowed for `historical` and `actual-run` only. Never allowed for unexecuted `synthetic` fixtures. |
| `validated (offline)` | Conclusively demonstrated through a named, actually executed local/offline before-and-after test or behavioral eval command. | Allowed only when backed by a named executed offline test/eval receipt. **Must never be represented as live server evidence.** |
| `validated (live-server)` | Proven across a complete, owner-audited actual server lifecycle with bound `ceTaskId → analysisId → qualityGate` and verified `code-fixed` resolution. | Allowed for `actual-run` only when all 11 Stage `F` conditions in [Remediation cycles](remediation-cycles.md#5-server-evidence-and-success-criteria) are satisfied. |

### 3. Applicability and Discovery Rationale (Required)
- `target_applicability`: Specific languages, frameworks, build tools (Maven, Gradle, npm, dotnet, Go, Cargo), scanner shapes (Shape A, Shape B, Shape C), and SonarQube editions/capabilities where the guidance applies.
- `prerequisites`: Required tools, analyzer plugins, environment capabilities, or quality profile conditions.
- `discovery_rationale`: Technical justification explaining why this remediation strategy or lifecycle ordering was chosen over rejected alternatives, tagged with its confidence label.

### 4. Sanitized Procedure and Effects (Required)
- `step_by_step_procedure`: Ordered, deterministic steps (each tagged with its per-step confidence label and expected effect) using standardized placeholders.
- `expected_effects`: Concrete modifications produced in source code, build configuration, or test suites, and explicit non-effects (e.g., no credential exposure, no unapproved uploads).

### 5. Observed Failures, Limits, and Root Causes (Required)
- `observed_failures`: Sanitized compiler messages, test assertion failures, or scanner/CE error codes encountered, each tagged with its confidence label.
- `operational_limits`: Known edge cases, boundary conditions, or environments where the solution does not hold.
- `root_cause_analysis`: Technical diagnosis explaining why the issue or lifecycle failure manifested, tagged with its confidence label.

### 6. Counterexamples and Proposed Reusable Edit (Conditional)
*Required whenever proposing a reusable skill, actor, reference, or eval promotion (`Gate 3` and `Gate 4`); optional (`not-applicable (no promotion proposed)`) for routine run logs that propose no harness changes:*
- `synthetic_counterexample`: Minimal reproducible snippet demonstrating the flawed pattern.
- `synthetic_correction`: Minimal synthetic snippet demonstrating the corrected, compliant pattern.
- `target_file`: Specific skill, actor, command, or reference file proposed for updating.
- `proposed_diff`: Concrete, minimal Markdown or code diff implementing the candidate improvement.

---

## 4. Owner-Reviewed Promotion Policy

Guidance reports are **untrusted candidate recommendations**. Promotion into canonical skills, actors, references, or evals requires explicit owner sign-off across all four sequential gates:

1. **Gate 1 — Owner Privacy & Redaction Audit:** Repository owner verifies zero secrets (`<REDACTED_SECRET_TOKEN>`), env dumps (`<REDACTED_ENV_VAR>`), private hosts (`<REDACTED_SONAR_HOST>`), project/org/issue/task/analysis IDs, personal identifiers, proprietary source code (`<SYNTHETIC_CODE_FIXTURE>`), or customer data (`<REDACTED_CUSTOMER_DATA>`) remain, and verifies neutral slugs. Any leak rejects the candidate immediately.
2. **Gate 2 — Technical Applicability & Value Assessment:** Owner verifies the lesson is generalizable across target projects rather than transient project trivia, and honors YAGNI, KISS, and DRY.
3. **Gate 3 — Empirical Evidence & Counterexample Verification:** Owner validates official vendor documentation alongside observed evidence, a minimal synthetic counterexample/correction, and truthful provenance-capped confidence labels (`hypothesized` vs. `observed` vs. `validated (offline)` vs. `validated (live-server)`). Extension acceptance can review historical or synthetic candidates with explicit labels and requires no new live-run lesson.
4. **Gate 4 — Minimal Scoped Edit & Behavioral Evaluation:** Owner approves a minimal surgical edit to the skill/actor/reference file paired with a consumer-visible offline behavioral evaluation scenario in `evals/evals.json`, distributed through standard packaging (`npm pack` / installer).

### Strictly Forbidden Anti-Patterns
- **No Autonomous Self-Modification:** Running agents are strictly prohibited from editing their own prompts, skill instructions, or reference files at runtime.
- **No Background Telemetry or Learning Database:** Guidance files must never be transmitted to external servers, cloud databases, or third-party analytics endpoints.
- **No Direct Rule Injection:** Guidance text must never be executed directly as agent instructions or shell commands.
