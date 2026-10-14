# Ordered Scanner Lifecycles, Auth Separation, and Recovery

This reference defines execution rules for local Sonar scanner lifecycles, authentication boundaries, submission tracking, and failure recovery.

## 1. Ordered Lifecycle Stages

Local analysis and scanning must follow strict, verifiable stage ordering. Coverage report freshness must be verified before the report importer or submission stage, not necessarily before scanner preparation:

```text
1. Preparation
   ├── Actions: Clean only approved, regenerable build paths; never remove stale scanner task files while an unresolved task or dispatching/no-task-ID intent needs recovery. Return task/target/provenance inline for parent durability in sonar-report.md outside regenerable scanner directories; resolve approved dependencies.
   └── Effects: Writes to build scratch dirs; Network: None (or project-approved package restore).
2. Instrumentation / Begin (if required by lifecycle shape)
   ├── Actions: Initialize scanner hooks, listeners, or analyzers (.sonarqube/, build-wrapper).
   └── Effects: Writes local config/instrumentation files; Network: None (or preflight server query).
3. Native Build
   ├── Actions: Execute compilation using the repository's native compiler and flags.
   └── Effects: Writes compiled binaries, build logs; Network: None.
4. Native Test Execution
   ├── Actions: Execute all applicable tests via the repository's native test runner.
   └── Effects: Writes test execution reports and logs; Network: None.
5. Coverage Report Generation
   ├── Actions: Produce fresh, uncorrupted coverage reports (e.g., LCOV, JaCoCo XML, Cobertura).
   └── Effects: Writes coverage report files; Network: None.
6. Import, Scanner Execution, and Upload
   ├── Actions: Execute scanner analysis, importing fresh coverage/execution reports. Scanner or Shape C `end` is upload-capable: require explicit preflight authorization naming server/project/branch-or-PR and, for bounded cycles, parent-approved durable per-target in-flight intent in sonar-report.md before dispatch per [remediation cycles §3](remediation-cycles.md#3-state-persistence-and-resume-protocol).
   └── Effects: Writes scanner working directory (e.g., .scannerwork/) and logs; Network: Preflight queries and analysis payload upload (when upload is authorized).
7. Submission and Task Tracking
   ├── Actions: Capture `ceTaskId` from scanner output or native task files (`.scannerwork/report-task.txt`, `.sonar/report-task.txt`); verify fresh invocation provenance and exact target/server/selector, binding task to pre-scan SHA/source/generated digests. Return inline; parent persists and acknowledges durability before actor polling or next target upload.
   └── Effects: Returns verified task metadata inline for parent recording in the same sonar-report.md, not an additional file; Network: None.
8. Finalization
   ├── Actions: Poll server task status for recorded `ceTaskId`, correlate `ceTaskId → analysisId → quality gate status`, and retrieve gate verdict and condition breakdown.
   └── Effects: Returns task/analysis-bound gate evidence inline for parent recording in the same sonar-report.md, not an additional gate-summary file; Network: Task status and quality gate status queries.
```

## 2. Supported Scanner Lifecycle Shapes

Rather than hardcoding language-specific adapters, workflows conform to one of three universal lifecycle shapes:

### Shape A: Integrated Build / Scanner
- **Description:** Build tool directly incorporates Sonar analysis plugins (e.g., Maven `sonar:sonar`, Gradle `sonar`).
- **Flow:** `Preparation → Build + Test + Coverage → Integrated Scanner Goal → Submission Tracking → Finalization`.
- **Constraint:** Test execution logs and freshly generated coverage artifacts must be explicitly verified before executing the upload-capable scanner goal. If single-command goal chaining prevents intermediate inspection, split execution into a native verification run (`clean verify`) followed by the scanner goal invocation, or enforce build-plugin configuration that fails immediately on missing or stale coverage. Scanner goal execution is upload-capable and requires preflight upload authorization.

### Shape B: Standalone Scanner
- **Description:** Native build and tests run first; an independent scanner CLI analyzes the repository and imports pre-generated artifacts.
- **Flow:** `Native Build → Native Test → Coverage Generation → Verification of Fresh Reports → Scanner CLI Execution → Submission`.
- **Constraint:** Scanner must never execute if tests fail or if coverage reports are missing, stale, or malformed.

### Shape C: Preparation → Build → End
- **Description:** Analysis requires a pre-build hook to intercept compilation and a post-build command to finalize and upload (e.g., .NET `begin`/`end` commands, C/C++ build wrapper).
- **Flow:** `Begin Hook → Native Build → Native Test → Coverage Generation → End Hook / Upload → Submission`.
- **Constraint:** The upload-capable `end` hook is **never** a cleanup command. If build or tests fail, abort the lifecycle without executing the upload command.

## 3. Native Semantic Parity Verification

- **Semantic Drift Risk:** Instrumented builds may mask or introduce compiler warnings, test race conditions, or optimization side effects.
- **Mandatory Native Verification:** When scanner instrumentation or wrappers alter compiler flags, build hooks, or analysis analyzers (such as C/C++ build-wrapper or .NET `begin` steps), a separate clean uninstrumented native verification (`clean build` and full test suite) is mandatory to verify clean native semantics before declaring changes complete.
- **No Universal Flags:** Use only project-approved commands; do not inject undocumented compiler flags or third-party wrappers.

## 4. Authentication Separation and TLS Boundaries

Maintain strict separation between CLI query sessions and scanner process credentials:

### Read and Query Sessions (`sonar` CLI)
- Verify CLI authentication status with `sonar auth status` prior to issue or quality gate queries.
- Prompt the user for `sonar auth login` if unauthenticated.
- Never extract, print, store, or inject tokens into query URLs or script logs.

### Scanner Process Credentials
- Scanner processes require dedicated, project-approved credentials (e.g., environment variables configured in the runner environment).
- Never prompt the user for literal tokens in terminal prompts or pass secrets as plaintext command-line arguments.
- Do not assume that active `sonar` CLI session login provides credentials for background build plugins (e.g., Maven, Gradle, or .NET).

### TLS and Network Safety
- Never disable TLS certificate verification (such as passing `--insecure` or setting `NODE_TLS_REJECT_UNAUTHORIZED=0`).
- Never automatically add or alter trust overrides, certificates, or corporate proxy settings without explicit owner approval. Project-approved trust configurations (such as `-Djavax.net.ssl.trustStore`) are owner-gated.
- If TLS handshake errors occur, stop execution, report the exact diagnostic error, and require owner intervention.

## 5. Stage-Specific Failure Recovery

Never execute generic cleanup scripts that could submit partial or invalid analysis to the Sonar server:

| Stage Failure | Recovery Action | Forbidden Action |
|---|---|---|
| **Preparation Failure** | Abort. Clean scratch directories without running build or scanner. | Do not repeat preparation blindly or ignore missing dependencies. |
| **Native Build / Test Failure** | Stop immediately. Preserve compiler and test failure logs for debugging. | **NEVER** run upload-capable scanner or `end` hook as cleanup. |
| **Coverage Generation Failure** | Abort before scanner import. Inspect test runner and report generator logs. | Do not proceed to scanner execution with missing or stale coverage. |
| **Scanner Execution Failure** | Record scanner logs. Verify scanner version and property compatibility. | Do not alter scanner version or download unapproved binaries. |
| **Submission Timeout / Error** | Poll the exact verified task only after parent persistence/acknowledgement. An intent without task ID permits only verified fresh native task-file recovery bound to invocation/checkout/target/checkpoint; otherwise halt `submission-unverified`. No recovered ID does not prove no task was created. | Never blindly re-submit, reuse an interrupted intent, or substitute latest project gate. |

## 6. Labeled Offline Scenario Traces

### Scenario L-TR-01: Standalone scanner with fresh coverage verification
- **Trace:**
  1. `npm test -- --coverage` outputs `coverage/lcov.info` from the tested commit SHA S1 at timestamp T1.
  2. Importer validates report freshness per the canonical two-factor rules in [Project discovery](project-discovery.md).
  3. For bounded cycles, parent durably records per-target upload intent and approves dispatch; scanner runs with authorized project-discovered coverage properties (e.g., `-Dsonar.javascript.lcov.reportPaths=coverage/lcov.info`).
  4. Scanner receives `ceTaskId: AX123456789` in native `report-task.txt`. Actor returns verified metadata inline; parent persists/acknowledges before exact-task polling.

### Scenario L-TR-02: Preparation→Build→End abort on test failure
- **Trace:**
  1. `dotnet sonarscanner begin` completes successfully.
  2. `dotnet build` succeeds.
  3. `dotnet test` fails with 1 assertion failure.
  4. Pipeline aborts immediately. `dotnet sonarscanner end` is **NOT** invoked, preventing partial submission.

### Scenario L-TR-03: Submission recovery after disconnect
- **Trace:**
  1. Parent durably records/approves bounded-cycle upload intent; scanner uploads and writes `ceTaskId: TSK-8899` in native `report-task.txt`.
  2. Connection drops before parent receives/persists the ID; report retains `dispatching/no-task-ID`.
  3. Resume recovers only a fresh task file with verified invocation/checkout/server/project/selector/pre-scan provenance. Parent persists/acknowledges TSK-8899, then actor queries `sonar api get "/api/ce/task?id=TSK-8899"`; missing/ambiguous provenance blocks `submission-unverified`, never a new scan.

### Scenario L-TR-04: TLS handshake failure
- **Trace:**
  1. Scanner reports `PKIX path building failed: unable to find valid certification path`.
  2. Execution halts. Diagnostics report certificate verification failure.
  3. System refuses to disable TLS verification or alter security policies; halts for owner remediation.

