# Project and Execution Profile Discovery

This reference defines neutral discovery rules for project layout, toolchains, safe input identity, and execution profiles across any language or runtime.

## 1. Discovery Order

Discover configuration and capabilities deterministically without pinning or upgrading tools:

1. **Input manifests:** Inspect tracked repository manifests (`package.json`, `pom.xml`, `build.gradle`, `*.sln`/`*.csproj`, `go.mod`, `pyproject.toml`/`setup.cfg`, `Cargo.toml`, `CMakeLists.txt`).
2. **Approved scripts, scanner configs, and tracked CI:** Inspect `.sonar-config.json`, `sonar-project.properties`, tracked CI workflows (`Jenkinsfile`, `.github/workflows`), and package scripts. Treat discovered scripts as execution candidates until explicitly approved; discovery never grants execution permission.
3. **Installed tool help and versions:** Inspect local tool availability (`sonar --help`, `mvn -v`, `dotnet --version`, `node -v`, `pytest --version`, `go version`). Never install, upgrade, or alter global/local tool versions.
4. **Matching official vendor documentation:** Consult official scanner/analyzer docs for verified flag and parameter mappings.

Ask the user only for conflicting, ambiguous, or unresolved configuration, or materially different trade-offs.

## 2. Safe Actual-Input Identity

Capture repository and input identity while strictly preventing credential leakage:

- **Repository and ref identity:** Record repository root, commit SHA, and exact ref. Use either `--branch <branch>` or `--pull-request <pr-id>`, never both.
- **Manifests and effective configuration:** Record tracked and untracked manifest paths and nonsecret effective scanner configuration.
- **Secret safety:** Never hash, inspect, or log secret-bearing files (such as `.env`, credential stores, keystores, or token files). Redact secret-valued properties (such as `sonar.token`, `sonar.login`, `sonar.password`) when capturing effective scanner configurations; secret values must never be stored, logged, or hashed.
- **Source and report mappings:** Record source roots, test roots, exclusions, module boundaries, and report-to-source mappings.
- **Generated-input provenance:** Document the exact command and source commit producing generated inputs.
- **Dirty-tree policy:** Preserve unrelated changes. Unrelated dirty files are permitted only when demonstrably outside analysis and build inputs. Build generator or hook drift invalidates affected evidence.
- **Storage location:** Record private evidence artifacts outside the checkout or in an already-approved ignored location.
- **Two-factor report freshness:** Treat report timestamps as necessary but insufficient evidence (as checkout timestamps, uncommitted edits, or dirty trees can mask stale contents). Valid freshness requires (1) temporal verification: report timestamp must be strictly newer than both the commit committer timestamp and the newest modification time across all tested source files, test files, nonsecret configuration, and generated inputs. When report mtime is equal to or within filesystem granularity or clock skew (<= 2 seconds) of source files, treat timestamp as ambiguous and enforce active input content digest verification; never accept ambiguous or stale reports. (2) Provenance binding: record binding the artifact to current commit SHA, active input content digest (covering source, tests, manifests, nonsecret build configuration, and generated inputs; strictly excluding secret-bearing files), producing command, and execution run session.

## 3. Applicability and Requirement Separation

Separate explicit requirements from runtime observations:

| Category | Allowed States | Behavioral Impact |
|---|---|---|
| **Requirement Level** | `required`, `optional`, justified `not-applicable` | Preflight contract. Justified `not-applicable` requires explicit preflight approval. |
| **Observation State** | `available/passed`, `available/failed`, `unsupported`, `unavailable/misconfigured` | Execution reality. Required unsupported or unavailable capability blocks success. |

- **Test execution:** Applicable required tests must actually run and pass. Never force Maven, XML, or a nonzero test count for justified no-test profiles.
- **Coverage calculation:** Unsupported branch coverage cannot be treated as implicit N/A. Zero denominator is not 100%. Stale or malformed coverage reports are rejected.
- **Toolchain boundaries:** Never transplant historical corporate hostnames, keys, issue counts, or coverage thresholds into defaults.

## 4. Execution Profile Shape

A data-only execution profile maps:

```text
Repository Identity (SHA, branch/PR, tracked/untracked manifests, nonsecret config)
  → Discovered Toolchain (OS, shell, native runner, tool versions, dependencies, profiles)
  → Test Commands (focused selectors, full verification, smoke commands)
  → Coverage Specification (native format, report path, counters, denominators, thresholds, operators, import parameters)
  → Requirement Contract (tests: required/optional/N/A; coverage: required/optional/N/A)
  → Ordered Lifecycle Stages (preparation → instrumentation → build → test → coverage → import/upload → submission tracking → finalization)
  → Verification Strategy (mandatory uninstrumented native verification if scanner mutates build semantics)
```

## 5. Labeled Offline Scenario Traces

These scenario traces demonstrate policy compliance without requiring live network access or real credentials:

### Scenario D-TR-01: Non-Java local-only remediation
- **Context:** Python/TypeScript project with Sonar findings reported via offline file.
- **Discovery:** Manifests show `package.json` with Jest or `pyproject.toml` with pytest. No `sonar` CLI session active.
- **Behavior:** Local source remediation and native test execution proceed directly. No Sonar authentication or remediation round budget N (a global maximum on entered fix rounds) is required for ordinary local fixes.

### Scenario D-TR-02: Justified no-tests vs missing required tests
- **Case A (Justified N/A):** Static documentation or schema-only repository where preflight confirms `tests: justified not-applicable`. Zero test count is accepted without forcing test runners.
- **Case B (Missing required):** Application codebase where tests are configured in CI but the local test runner is missing or misconfigured (`tests: required`, observation: `unavailable`). Pipeline blocks immediately; failure is not masked.

### Scenario D-TR-03: Stale, malformed, or zero-denominator coverage
- **Case A (Stale):** Coverage artifact timestamp precedes the latest source commit or newest tested file mtime, or fails the provenance check against current commit SHA S1 and input content digest. The report is rejected as stale; fresh clean-suite execution is required.
- **Case B (Zero denominator):** Module contains zero executable lines/branches. The calculation yields `0/0` (undefined/empty), which must never be reported as `100%`.
- **Case C (Unsupported branch):** Language toolchain provides statement-only coverage. Branch metric is recorded as `unsupported`, not implicitly satisfied.

### Scenario D-TR-04: Scanner altering native build semantics
- **Context:** C/C++ build-wrapper or .NET `begin` step modifies compiler invocation or Roslyn analyzers.
- **Behavior:** Instrumented build passes, but a separate uninstrumented native build and test run must execute to verify clean native semantics.

### Scenario D-TR-05: Conflicting project or branch identity
- **Context:** Git branch is `feat/login`, but `.sonar-config.json` specifies `branch: main`.
- **Behavior:** Discovery halts; the tool requests user confirmation when the target selector is ambiguous or conflicting, instead of assuming a default branch or overwriting remote branch history.

### Scenario D-TR-06: CI-only scanner capability
- **Context:** Project lacks local Sonar scanner binary; scanning only occurs in Jenkins CI.
- **Behavior:** Discovery marks local scanner as `unavailable`. Local remediation stops before submission and hands off to the separately authorized CI route. It does not auto-push to Git.

## 6. Implementation Scope and Releasability Boundary

This reference delivers authoring domain policy within the extension source tree. Standalone installer manifests (`lib/install.js`) and tests retain the legacy 10-asset payload until Phase 06 updates the inventory to the planned 18-asset dual-root payload. Phase 02 artifacts are source-tree references and must not be published or released as an installed package prior to Phase 06.

