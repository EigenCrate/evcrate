# Sanitized Run Guidance Report

> **SHARING & PRIVACY NOTICE:** Any sharing of this sanitized guidance report—including **committing into a shared repository, pushing to a remote branch, attaching to a pull request or issue, or distributing outside the local workspace**—requires explicit repository owner permission.
>
> **DATA NOTICE:** All entries below are sanitized retrospective candidate guidance and analysis data, not executable runtime instructions. Guidance must never be automatically promoted or injected into agent prompts. All sample entries marked `[ILLUSTRATIVE PLACEHOLDER]` must be replaced with sanitized records. Redaction, provenance ceilings, and promotion gates are governed by [Run guidance](../references/run-guidance.md).

---

## 1. Guidance Identification, Versions & Provenance

| Field | Value | Notes / Contract Binding |
|---|---|---|
| **Guidance ID** | `GD-<YYMMDD>-<slug>` | Neutral technical `<slug>` only (never embed project/ticket/user names) |
| **Creation Date & Time** | `YYYY-MM-DDTHH:MM:SSZ` | ISO 8601 timestamp of guidance emission |
| **Provenance** | `synthetic \| historical \| actual-run` | Governs maximum confidence ceiling ([Run guidance §3.2](../references/run-guidance.md#3-guidance-schema-and-field-definitions)) |
| **Skill / Command / Actor Versions** | `sonarqube-test-quality@<ver> / cmd-sonar-remediate@<ver> / sonar-evidence@<ver> / profile-v1` | Versions of loaded extension artifacts |
| **Toolchain & Server Versions** | `<Language/Runtime, Build Tool, Scanner Version, SonarQube Edition & Version>` | Sanitized version inventory |
| **Summary Confidence Level** | `hypothesized \| observed \| validated (offline) \| validated (live-server)` | `synthetic` caps at `hypothesized`; `validated (offline)` requires named executed offline check |
| **Source Run Outcome** | `server-verified success \| server-verified residual findings \| blocked/incomplete \| locally remediated \| reviewed \| awaiting commit` | Canonical outcome of originating run |
| **Halting / Escalation Trigger** | `none \| budget-n-exhausted \| two-round-no-progress \| failed-rereview \| declined-commit \| declined-upload \| test-or-build-failed \| task-failed \| task-timeout \| resume-checkpoint-drift \| consistency-unknown` | Accompanying trigger when halted |
| **Automated Auditing Role** | `<independent-reviewer-role> \| <evidence-actor-role>` | Host-neutral subagent role that compiled or verified the summary |
| **Owner Reviewer Identity** | `<REDACTED_REVIEWER_ID> \| pending-owner-review` | Human owner reviewing privacy/promotion (redacted in shared copies) |

---

## 2. Applicability Profile & Discovery Rationale

### Supported Environment & Capabilities
- **Target Language(s) & Versions:** `<e.g., Java 17+, Node.js 22+, .NET 8+, Go 1.22+>`
- **Build Tool & Test Runner:** `<e.g., Maven 3.9+ / Surefire, npm / node --test, dotnet test>`
- **Scanner Lifecycle Shape:** `<Shape A (Integrated) | Shape B (Standalone) | Shape C (Prep/Build/End)>`
- **SonarQube / SonarCloud Capabilities:** `<Edition, Version, MQR vs Standard mode, Task/Gate correlation support>`
- **Required Plugins / Analyzers:** `<e.g., JaCoCo XML importer, LCOV sensor, build-wrapper>`

### Discovery Rationale
- **Selected Strategy:** `[Describe why the chosen approach satisfied profile and lifecycle constraints]`
- **Rejected Alternatives:** `[Describe competing options discarded due to stale coverage risks, semantic drift, or missing capabilities]`
- **Rationale Confidence:** `hypothesized | observed | validated (offline) | validated (live-server)`

---

## 3. Sanitized Ordered Procedure & Concrete Effects

*Uses standardized privacy placeholders from [Run guidance §2](../references/run-guidance.md#2-mandatory-redaction-rules-and-placeholders) (`<REDACTED_SONAR_HOST>`, `<REDACTED_PROJECT_KEY>`, `<REDACTED_PROJECT_PATH>`, etc.) and per-step confidence labels.*

| Step # | Ordered Action (Sanitized) | Expected Effect & Non-Effect Boundary | Per-Step Confidence |
|---|---|---|---|
| `[ILLUSTRATIVE PLACEHOLDER]` `1` | Configure nonsecret scanner properties (`sonar.host.url=<REDACTED_SONAR_HOST>`, `sonar.projectKey=<REDACTED_PROJECT_KEY>`, `sonar.projectName=<REDACTED_PROJECT_NAME>`, `sonar.organization=<REDACTED_ORG_KEY>`). | Binds target identity without embedding `<REDACTED_SECRET_TOKEN>` or `<REDACTED_ENV_VAR>`. | `hypothesized (illustrative template placeholder)` |
| `[ILLUSTRATIVE PLACEHOLDER]` `2` | Execute native test and coverage command in `<REDACTED_PROJECT_PATH>` on branch `<REDACTED_BRANCH_NAME>` (or PR `<REDACTED_PR_ID>`) at `<REDACTED_COMMIT_SHA>`, then verify canonical two-factor report freshness. | Produces fresh coverage artifact before scanner import; aborts if tests fail or report is stale. | `hypothesized (illustrative template placeholder)` |
| `[ILLUSTRATIVE PLACEHOLDER]` `3` | Invoke scanner using environment-arranged authentication and track task `<REDACTED_TASK_ID>` → analysis `<REDACTED_ANALYSIS_ID>`. | Uploads analysis only after passing prereqs; binds exact gate and paginated findings. | `hypothesized (illustrative template placeholder)` |

---

## 4. Observed Failures, Operational Limits & Root-Cause Lessons

| Observation ID | Sanitized Failure / Symptom / Limit | Root-Cause Technical Lesson | Operational Limit / Counterexample Condition | Per-Observation Confidence |
|---|---|---|---|---|
| `[ILLUSTRATIVE PLACEHOLDER]` `OBS-01` | Issue `<REDACTED_ISSUE_ID>` (`java:S2095`) with message `<REDACTED_FINDING_MESSAGE>` persisted after closing stream in `try` body without `finally`/try-with-resources. | Early exception before manual `.close()` leaks descriptor; try-with-resources guarantees closure on all exit paths. | Custom wrappers not implementing `AutoCloseable` require explicit `try/finally` disposal. | `hypothesized (illustrative template placeholder)` |
| `[ILLUSTRATIVE PLACEHOLDER]` `OBS-02` | Hotspot `<REDACTED_HOTSPOT_ID>` remained `TO_REVIEW` after automated scan. | Evidence actor cannot resolve hotspots; project owner `<REDACTED_REVIEWER_ID>` must review threat context manually. | Applies to security hotspots requiring human threat evaluation. | `hypothesized (illustrative template placeholder)` |

---

## 5. Counterexamples, Proposed Reusable Edit & Promotion Checklist *(Conditional)*

*Required when proposing a reusable skill, actor, reference, or eval promotion ([Run guidance §4](../references/run-guidance.md#4-owner-reviewed-promotion-policy)); record `not-applicable (no promotion proposed)` for routine no-change run logs.*

### Minimal Synthetic Counterexample (Flawed Pattern)
```java
// [ILLUSTRATIVE PLACEHOLDER] SYNTHETIC_CODE_FIXTURE — zero proprietary or <REDACTED_CUSTOMER_DATA> content
public class SyntheticResourceHandler {
    public byte[] readData(java.nio.file.Path path) throws java.io.IOException {
        java.io.InputStream in = java.nio.file.Files.newInputStream(path); // Flawed: leaked if readAllBytes throws
        return in.readAllBytes();
    }
}
```

### Minimal Synthetic Correction (Compliant Pattern)
```java
// [ILLUSTRATIVE PLACEHOLDER] SYNTHETIC_CODE_FIXTURE — compliant pattern
public class SyntheticResourceHandler {
    public byte[] readData(java.nio.file.Path path) throws java.io.IOException {
        try (java.io.InputStream in = java.nio.file.Files.newInputStream(path)) {
            return in.readAllBytes();
        }
    }
}
```

### Candidate File & Minimal Scoped Diff
- **Target File:** `<e.g., ext/sonarqube-test-quality/references/testing-and-coverage.md | not-applicable (no promotion proposed)>`
- **Candidate Edit Confidence:** `hypothesized | observed | validated (offline) | validated (live-server)`
- **Proposed Minimal Diff:**
  ```markdown
  +### [ILLUSTRATIVE PLACEHOLDER] Resource Lifecycle Verification in Tests
  +When remediating resource-leak rules (such as `java:S2095`), verify that tests exercise
  +exception-throwing branches to confirm deterministic closure under failure conditions.
  ```

### Four-Gate Owner Promotion Sign-Off
*See full gate rules in [Run guidance §4](../references/run-guidance.md#4-owner-reviewed-promotion-policy):*
- [ ] **Gate 1 — Owner Privacy & Redaction Audit:** Verified zero secrets, env vars, private hosts/paths, project/org/issue/task/analysis IDs, personal IDs, proprietary source, or customer data; verified neutral slugs.
- [ ] **Gate 2 — Technical Applicability & Value Assessment:** Verified generalizable lesson adhering to YAGNI, KISS, and DRY.
- [ ] **Gate 3 — Empirical Evidence & Counterexample Verification:** Verified vendor docs, observed evidence, synthetic counterexample, and provenance-capped confidence labels.
- [ ] **Gate 4 — Minimal Scoped Edit & Behavioral Evaluation:** Verified minimal surgical diff + consumer-visible scenario in `evals/evals.json` + standard distribution (`npm pack` / installer).
