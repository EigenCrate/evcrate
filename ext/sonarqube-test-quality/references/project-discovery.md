# Project and Execution Profile Discovery

This reference defines neutral discovery rules for project layout, toolchains, safe input identity, and execution profiles across any language or runtime.

## 1. Discovery Order and Target Resolution

Discover configuration, targets, and capabilities deterministically without pinning or upgrading tools:

1. **Target resolution priority:**
   - **Explicit target first:** User-specified module, target project path, or command target selector argument takes precedence.
   - **Tracked CI and config mapping next:** Inspect `.sonar-config.json`, `sonar-project.properties`, tracked CI workflows (`Jenkinsfile`, `.github/workflows`), or package/manifest scripts.
   - **Bounded candidate discovery only:** When no explicit target or tracked mapping exists, search for build manifests only within and up to the selected checkout root. Never pick the first ancestor POM blindly, and never search outside the checkout root.
   - **Ambiguous targets block:** When multiple candidate reactor POMs, unmapped sibling service directories, or conflicting targets match without explicit configuration, halt discovery immediately with outcome `blocked/incomplete`. Prompt the user for explicit target selection; never guess or assume a default.
2. **Input manifests:** Inspect tracked repository manifests (`package.json`, `pom.xml`, `build.gradle`, `*.sln`/`*.csproj`, `go.mod`, `pyproject.toml`/`setup.cfg`, `Cargo.toml`, `CMakeLists.txt`). Verify applicable manifests exist as regular files; missing manifest blocks only applicable toolchains.
3. **Approved scripts, scanner configs, and tracked CI:** Treat discovered scripts as execution candidates until explicitly approved; discovery never grants execution permission.
4. **Installed tool help and versions:** Inspect local tool availability (`sonar --help`, `mvn -v`, `dotnet --version`, `node -v`, `pytest --version`, `go version`). Never install, upgrade, or alter global/local tool versions.
5. **Matching official vendor documentation:** Consult official scanner/analyzer docs for verified flag and parameter mappings.

Ask the user only for conflicting, ambiguous, or unresolved configuration, or materially different trade-offs.

<a id="2-safe-actual-input-identity"></a>
<a id="2-three-root-execution-context-and-identity-validation"></a>
## 2. Safe Actual-Input Identity and Three-Root Execution Context

Execution context and input identity require deterministic discovery, canonicalization, and strict separation across three distinct identities:

### 2.1 Three-Root Execution Identities

| Identity | Binding and use |
|---|---|
| `installed_skill_root` / explicit source skill root | Loaded skill location; resolve policies/helpers here, never from process cwd or a competing installation. |
| `checkout_root` | Selected Git checkout/worktree bound to SHA/ref; never the shared Git administrative directory. |
| Per-target `execution_root` / `service_execution_root` | Child-process cwd, possibly a monorepo service; must be contained in checkout but need not equal it. |
| `manifest_path` / `execution_manifest` | Approved regular manifest contained in checkout, including selected reactor manifests; independently frozen with target context. |

1. **`installed_skill_root`:**
   - Path to the active extension installation containing skills and references (e.g., `<installed-root>/skills/sonarqube-test-quality`).
   - Resolves strictly from the loaded entrypoint file location (script path or command manifest).
   - **NEVER** resolve from process working directory (`process.cwd()`), a presumed parent repository, or an unselected competing installation root.
2. **`checkout_root`:**
   - Expected selected Git checkout or worktree root, bound to existing commit SHA and ref checkpoint.
   - In Git worktrees, the checkout root is the worktree working directory (e.g., `/path/to/worktree`), **not** the shared repository administrative directory (`.git/worktrees/...` or the main repo `.git`).
   - Standalone offline coverage parsing does not acquire a Git requirement. Snapshot mode requires only context appropriate to its read-only scope.
3. **`execution_root`:**
   - The per-target child process working directory (CWD) where native build, test, and scanner commands actually execute.
   - In monorepos, `execution_root` is the specific service directory (e.g., `<checkout_root>/services/auth`); in standard single-project repos, it equals `checkout_root`.
   - **Rule:** Never require `execution_root == checkout_root`. A service inside a monorepo is a valid execution root.
   - `manifest_path`: Absolute path to the approved regular build manifest (e.g., `<execution_root>/pom.xml` or selected reactor POM). Verify the manifest resolves to a regular file whose canonical path (`fs.realpathSync`) is contained within canonical `checkout_root` (allowing module POMs in `execution_root` or reactor POMs at `checkout_root`), explicitly rejecting symlinks that escape the repository tree. Missing manifest blocks only applicable toolchains.

`service_execution_root` and `execution_manifest` are names for the per-target `execution_root` and `manifest_path` in caller context; they must identify the same frozen paths, not competing roots or manifests. For source-checkout use, bind the explicit source skill root independently of the service checkout. The caller's approved directory, selected Git checkout, installed/source skill root, and every target's execution root/manifest are independently resolved and forwarded; no one path is inferred from another or from persistent terminal state.

### 2.2 Canonicalization and Path-Component-Aware Containment

1. **Canonicalize paths:** Resolve all paths to canonical, absolute normalized paths before comparison (`path.resolve`, `fs.realpathSync`) to handle symlinks, Windows backslashes, and case normalization, preventing path traversal (`../`) bypasses.
2. **Path-component containment:** Validate that `execution_root` is contained within `checkout_root` using path-component boundaries. Compute the relative path from canonical `checkout_root` to canonical `execution_root`: verify the first path component does not equal `'..'` and the path is not absolute. Naive string-prefix checks are strictly prohibited (e.g., `/repo-sibling` must not match `/repo`).

### 2.3 Git Identity Verification and Foreign Repository Rejection

For local verification and upload modes, validate Git repository identity from the selected execution directory:

1. **Git top-level validation:** Execute `git -C <execution_root> rev-parse --show-toplevel`. Resolve the returned path to a canonical path (`realpath`). The canonical top-level path must strictly equal canonical `checkout_root`.
   - This rule accepts monorepo service directories because canonical `git -C <checkout_root>/services/api rev-parse --show-toplevel` equals canonical `<checkout_root>`.
   - This rule accepts selected Git worktrees because canonical `git -C <worktree_root> rev-parse --show-toplevel` equals canonical `<worktree_root>`.
   - This rule **strictly rejects nested foreign repositories** (e.g., a foreign git clone or submodule nested inside the tree whose canonical top-level differs from `checkout_root`). Foreign repositories halt execution immediately (`blockers: ["foreign-repository-rejected"]`).
2. **Commit and Ref verification:** Validate `git -C <execution_root> rev-parse HEAD` equals `input_checkpoint.commit_sha`, and current ref matches the requested selector (`branch` or `pull_request`).
3. **Git command failure:** All Git commands must execute successfully (exit 0). Nonzero exits or missing Git binary halt discovery immediately with outcome `blocked/incomplete`.

### 2.4 Context Freezing and Forwarding

1. **Freeze context:** Once validated, freeze absolute `installed_skill_root`, `checkout_root`, `execution_root`, `manifest_path`, approved launcher, literal argv, and nonsecret invocation context.
2. **Forward to delegates:** Forward these frozen absolute paths to every child process, subagent, and evidence actor. Pass `cwd: execution_root` and explicit `-f <manifest_path>` where applicable.
3. **Re-check on launch:** Re-validate containment and Git identity on each child launch. Persistent interactive terminals or shell directory changes do not substitute for explicit child process CWD.

### 2.5 Safe Actual-Input Identity and Storage

Capture repository and input identity while strictly preventing credential leakage:

- **Repository and ref identity:** Record repository root, commit SHA, and exact ref. Use either `--branch <branch>` or `--pull-request <pr-id>`, never both.
- **Manifests and effective configuration:** Record tracked and untracked manifest paths and nonsecret effective scanner configuration.
- **Secret safety:** Never hash, inspect, or log secret-bearing files (such as `.env`, credential stores, keystores, or token files). Redact secret-valued properties (such as `sonar.token`, `sonar.login`, `sonar.password`) when capturing effective scanner configurations; secret values must never be stored, logged, or hashed.
- **Source and report mappings:** Record source roots, test roots, exclusions, module boundaries, and report-to-source mappings.
- **Generated-input provenance:** Document the exact command and source commit producing generated inputs.
- **Dirty-tree policy:** Preserve unrelated changes. Unrelated dirty files are permitted only when demonstrably outside analysis and build inputs. Build generator or hook drift invalidates affected evidence.
- **Storage location:** Parent alone maintains the private `sonar-report.md` outside the checkout or in an already-approved ignored location. API JSON remains transient; native build/test/coverage/scanner outputs remain native artifacts, not a second report or resume checkpoint.

### 2.6 Two-Factor Report Freshness Verification

Treat report timestamps as necessary but insufficient evidence (as checkout timestamps, uncommitted edits, or dirty trees can mask stale contents). Valid freshness requires:
1. **Temporal verification:** Report timestamp must be strictly newer than both the commit committer timestamp and the newest modification time across all tested source files, test files, nonsecret configuration, and generated inputs. When report mtime is equal to or within filesystem granularity or clock skew (<= 2 seconds) of source files, treat timestamp as ambiguous and enforce active input content digest verification; never accept ambiguous or stale reports.
2. **Provenance binding:** Record binding the artifact to current commit SHA, active input content digest (covering source, tests, manifests, nonsecret build configuration, and generated inputs; strictly excluding secret-bearing files), producing command, and execution run session.

<a id="3-applicability-and-requirement-separation"></a>
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
  → Execution Context (installed_skill_root, checkout_root, execution_root, manifest_path)
  → Discovered Toolchain (OS, shell, native runner, tool versions, dependencies, profiles, approved launcher, literal argv)
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

### Scenario D-TR-07: Monorepo service directory vs Git checkout root
- **Context:** Monorepo with Git checkout at `/workspace/repo`, service at `/workspace/repo/services/api/` with `pom.xml`.
- **Discovery:** `checkout_root` is `/workspace/repo`. Target resolves to `execution_root: /workspace/repo/services/api`. Canonical `git -C /workspace/repo/services/api rev-parse --show-toplevel` returns `/workspace/repo`.
- **Behavior:** Containment check passes (`execution_root` is inside `checkout_root`). Canonical Git top-level matches `checkout_root`. Manifest is regular file. Execution proceeds in `services/api` without requiring `execution_root == checkout_root`.

### Scenario D-TR-08: Delegated execution CWD mismatch and context freezing
- **Context:** Delegated subagent or terminal CWD is `/workspace/repo`, but target service is `services/order-service`.
- **Behavior:** Subagent does not rely on terminal directory state. It uses frozen absolute `execution_root: /workspace/repo/services/order-service` and passes explicit `cwd` and `-f /workspace/repo/services/order-service/pom.xml` to child launches.

### Scenario D-TR-09: Nested foreign git checkout rejection
- **Context:** Monorepo directory contains a nested foreign repository at `/workspace/repo/vendor/foreign-lib/` with its own `.git`.
- **Discovery:** Canonical `git -C /workspace/repo/vendor/foreign-lib rev-parse --show-toplevel` returns `/workspace/repo/vendor/foreign-lib`, which does not equal `checkout_root: /workspace/repo`.
- **Behavior:** Discovery halts immediately with `result_status: "unavailable"`, `canonical_outcome: "blocked/incomplete"`, `blockers: ["foreign-repository-rejected"]`. The foreign directory is blocked from build or upload.

### Scenario D-TR-10: Ambiguous Maven reactor POM candidate discovery
- **Context:** Repository contains two sibling modules `services/user/pom.xml` and `services/payment/pom.xml` with no root reactor POM and no target argument provided.
- **Behavior:** Bounded candidate discovery finds multiple POM candidates. Because no explicit target or CI mapping exists, discovery halts immediately with `canonical_outcome: "blocked/incomplete"`, requesting user clarification. It never blindly selects the first discovered POM.

