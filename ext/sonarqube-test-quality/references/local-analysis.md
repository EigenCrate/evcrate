# Ordered Scanner Lifecycles, Auth Separation, and Recovery

This reference defines execution rules for local Sonar scanner lifecycles, authentication boundaries, submission tracking, and failure recovery.

## 1. Ordered Lifecycle Stages

Local analysis and scanning must follow strict, verifiable stage ordering. Coverage report freshness must be verified before the report importer or submission stage, not necessarily before scanner preparation:

Every lifecycle child uses the frozen per-target `execution_root` (`service_execution_root`) as explicit `cwd`, with approved `manifest_path` (`execution_manifest`) and launcher/literal argv. Re-check canonical containment, regular applicable manifest and Git top-level against `checkout_root` on every launch; service roots need not equal the checkout root. Resolve policy/helper paths from `installed_skill_root` or explicitly selected source skill root, never the child's cwd. See [project discovery §2](project-discovery.md#2-safe-actual-input-identity).

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
   ├── Actions: Capture `ceTaskId` from scanner output or the discovered native task path (e.g., Maven `${project.build.directory}/sonar/report-task.txt`, `.scannerwork/report-task.txt`, `.sonar/report-task.txt`, or configured metadata directory). Resolve relative paths against the frozen per-target execution root; verify task-file mtime strictly newer than invocation start, invocation/checkout provenance and exact target/server/selector, binding task to pre-scan SHA/source/generated digests. Return inline; parent persists and acknowledges durability before actor polling or next target upload.
   └── Effects: Returns verified task metadata inline for parent recording in the same sonar-report.md outside regenerable build paths, not an additional file; Network: None.
8. Finalization
   ├── Actions: Poll server task status for recorded `ceTaskId`, correlate `ceTaskId → analysisId → quality gate status`, and retrieve gate verdict and condition breakdown.
   └── Effects: Returns task/analysis-bound gate evidence inline for parent recording in the same sonar-report.md, not an additional gate-summary file; Network: Task status and quality gate status queries.
```

## 2. Supported Scanner Lifecycle Shapes

Rather than hardcoding language-specific adapters, workflows conform to one of three universal lifecycle shapes:

### Shape A: Integrated Build / Scanner
- **Description:** Build tool directly incorporates Sonar analysis plugins (e.g., Maven `sonar:sonar`, Gradle `sonar`).
- **Flow:** `Preparation → Build + Test + Coverage → Integrated Scanner Goal → Submission Tracking → Finalization`.
- **Constraint:** Test execution logs and freshly generated coverage artifacts must be explicitly verified before executing the upload-capable scanner goal. If single-command goal chaining (such as `mvn clean verify sonar:sonar`) prevents intermediate inspection, split execution into:
  1. **Native verification run:** `mvn clean verify` to execute native compilation, tests, and fresh coverage generation.
  2. **Intermediate inspection:** Verify test logs, validate fresh coverage reports per canonical two-factor rules, and confirm zero working copy drift.
  3. **Integrated scanner goal execution:** Execute the scanner goal (`mvn org.sonarsource.scanner.maven:sonar-maven-plugin:<configured-version>:sonar`) retaining the identical checkout, module/reactor selection, active profiles, compiled artifacts, and fresh coverage reports with **NO intervening `clean`**. Multi-module lifecycles may require project-approved `install`, but never add `install` universally unless configured and approved. Scanner goal execution is upload-capable and requires explicit preflight upload authorization.

### Shape B: Standalone Scanner
- **Description:** Native build and tests run first; an independent scanner CLI analyzes the repository and imports pre-generated artifacts.
- **Flow:** `Native Build → Native Test → Coverage Generation → Verification of Fresh Reports → Scanner CLI Execution → Submission`.
- **Constraint:** Scanner must never execute if tests fail or if coverage reports are missing, stale, or malformed.

### Shape C: Preparation → Build → End
- **Description:** Analysis requires a pre-build hook to intercept compilation and a post-build command to finalize and upload (e.g., .NET `begin`/`end` commands, C/C++ build wrapper).
- **Flow:** `Begin Hook → Native Build → Native Test → Coverage Generation → End Hook / Upload → Submission`.
- **Constraint:** The upload-capable `end` hook is **never** a cleanup command. If build or tests fail, abort the lifecycle without executing the upload command.

<a id="3-native-semantic-parity-verification"></a>
## 3. Native Semantic Parity Verification and Windows Process Boundaries

### 3.1 Native Semantic Parity Verification
- **Semantic Drift Risk:** Instrumented builds may mask or introduce compiler warnings, test race conditions, or optimization side effects.
- **Mandatory Native Verification:** When scanner instrumentation or wrappers alter compiler flags, build hooks, or analysis analyzers (such as C/C++ build-wrapper or .NET `begin` steps), a separate clean uninstrumented native verification (`clean build` and full test suite) is mandatory to verify clean native semantics before declaring changes complete.
- **No Universal Flags:** Use only project-approved commands; do not inject undocumented compiler flags or third-party wrappers.

<a id="windows-maven-recipe-and-cross-platform-process-boundaries"></a>
### 3.2 Windows Maven Recipe and Cross-Platform Process Boundaries

When executing Maven on Windows (especially under PowerShell), follow this structured invocation contract to preserve arguments, location, and exit codes:

#### Invocation Contract

1. **Whole-string argument array:** Pass whole `-Dkey=value` strings in a PowerShell array. Never rely on backtick line continuations or unquoted property values.
2. **Call operator and splatting:** Invoke the literal executable using the call operator `&` and argument splatting (`& $mvnCmd @mvnArgs`). Never use `Invoke-Expression` or string concatenation.
3. **Explicit execution location and POM:** Combine explicit child directory setting (`Set-Location -LiteralPath $executionRoot`) with explicit manifest flag (`-f $manifestPath`). Explicit `-f` alone does not reliably resolve relative report or script paths; correct child working directory is mandatory.
4. **Shell/Batch Boundary Invariant:** PowerShell splatting handles argument construction inside PowerShell, but **does not guarantee batch file safety**. On Windows, `mvn.cmd` and `mvnw.cmd` cross Windows command shell (`cmd.exe`) batch processing, where batch metacharacters (`&`, `|`, `<`, `>`, `^`, `%`) or unbalanced quotes can undergo secondary expansion. Shell-sensitive values must be qualified against the actual approved launcher.
5. **Terminating launcher errors vs native failures:** Distinguish launcher/invocation failures (executable missing, permission denied, command not found) from native Maven build/test failures (process completed with nonzero exit code). Resolve launcher failures as terminating errors before reading `$LASTEXITCODE`; a failed launch can leave a stale `$LASTEXITCODE` from an earlier process.
6. **Immediate exit code capture:** Capture `$savedExitCode = $LASTEXITCODE` immediately after process completion, before executing any subsequent command or cleanup logic.
7. **Guaranteed location restoration:** Wrap invocations in `try ... finally` to guarantee restoring the caller's initial working directory (`Set-Location -LiteralPath $callerLocation` in `finally`).
8. **Diagnostic preservation:** Cleanup diagnostics in `finally` must **never** mask or overwrite the primary build failure or the recorded `$savedExitCode`.
9. **Child-script exit only:** Use `exit $savedExitCode` strictly at a dedicated child-script boundary where numeric exit code propagation to an outer shell runner is required; never call `exit` within interactive host sessions.

#### Windows Maven PowerShell Example

```powershell
# Example: Executing Maven verification and scan on Windows
$callerLocation = Get-Location
$mvnCmd = "mvn.cmd"  # Or project-approved ./mvnw.cmd / absolute path
$executionRoot = "C:\repo\services\api"
$manifestPath = "C:\repo\services\api\pom.xml"
$savedExitCode = 0

try {
    # Fail immediately if executionRoot cannot be set so commands never run in wrong CWD
    Set-Location -LiteralPath $executionRoot -ErrorAction Stop

    # Step 1: Native verification without scanner upload
    $verifyArgs = @(
        "-B",
        "-f", $manifestPath,
        "clean",
        "verify"
    )
    try {
        & $mvnCmd @verifyArgs
    }
    catch {
        $savedExitCode = 127 # Terminating launcher failure
        throw "Failed to launch Maven command '$mvnCmd': $_"
    }

    if ($LASTEXITCODE -ne 0) {
        $savedExitCode = $LASTEXITCODE
        throw "Native Maven verification failed with native exit code $savedExitCode"
    }

    # Step 2: Intermediate inspection (verify reports, drift check)
    # ... preflight upload authorization verified ...

    # Step 3: Scanner goal with identical reactor and NO clean
    $scannerVersion = "3.11.0.3922" # Discovered from pom.xml / config
    $scanArgs = @(
        "-B",
        "-f", $manifestPath,
        "org.sonarsource.scanner.maven:sonar-maven-plugin:$scannerVersion:sonar",
        "-Dsonar.projectKey=com.example:api"
    )
    try {
        & $mvnCmd @scanArgs
    }
    catch {
        $savedExitCode = 127
        throw "Failed to launch Maven scanner goal '$mvnCmd': $_"
    }

    if ($LASTEXITCODE -ne 0) {
        $savedExitCode = $LASTEXITCODE
        throw "Maven Sonar scanner goal failed with native exit code $savedExitCode"
    }
}
catch {
    # Assign failure code before any diagnostic write to prevent exit-code loss under Stop preference
    if ($savedExitCode -eq 0) { $savedExitCode = 1 }
    Write-Error -Message "Maven execution failed: $_" -ErrorAction Continue
}
finally {
    # Guard directory restoration so restoration errors never mask primary exit codes
    try {
        Set-Location -LiteralPath $callerLocation -ErrorAction Stop
    }
    catch {
        Write-Warning "Failed to restore caller location: $_"
        if ($savedExitCode -eq 0) { $savedExitCode = 1 }
    }
}

# If running at a dedicated child script boundary, propagate the saved numeric exit code:
if ($savedExitCode -ne 0) {
    exit $savedExitCode
}
```

<a id="4-authentication-separation-and-tls-boundaries"></a>
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

### Node CA vs Java/Maven Trust Isolation
- **Node CA configuration:** Environment variables such as `NODE_USE_SYSTEM_CA=1` affect only supporting Node.js processes; they do **not** configure or affect Java or Maven certificate trust.
- **Java/Maven trust:** Java tools (such as Maven and the Sonar Maven plugin) use Java trust stores (`javax.net.ssl.trustStore`). Do not assume that Node CLI certificates apply to Maven or that every `sonar` distribution uses standard Node.
- **Owner-gated trust changes:** Any certificate trust overrides, custom trust stores, or proxy settings remain strictly owner-gated. Never inject trust store properties without explicit owner approval.

## 5. Stage-Specific Failure Recovery

### Task Metadata Path Discovery and Bound Resumption
- **Dynamic metadata path discovery:** Scanner task metadata is not invariably written to `.scannerwork/report-task.txt`. Maven integrated lifecycles default to `${project.build.directory}/sonar/report-task.txt` (typically `<execution_root>/target/sonar/report-task.txt`), and projects may configure custom working directories. Discover the actual task file path from the effective scanner configuration.
- **Persistent binding before cleanup:** Actor returns verified `ceTaskId`, server/project/selector, pre-scan SHA/source/generated digests, native task path and invocation/submission bounds inline. Parent persists them in the same private `<evidence-destination>/sonar-report.md` outside regenerable build directories and acknowledges durability before polling, cleanup or next target upload. No actor checkpoint file.
- **Resume without re-upload:** Revalidate frozen roots/manifest, source/generated digests and recorded invocation provenance first. A verified known task resumes read-only polling, never preparation/build/scanner or another N entry. Source drift permits only recording terminal status, not certification. An interrupted `dispatching/no-task-ID` intent permits only verified fresh native task-file recovery and parent acknowledgement, never reuse or resubmission.
- **Missing metadata blocks retry:** Missing, stale, wrong-target or ambiguous task metadata leaves `submission-unverified`, `blocked/incomplete`; it never proves that no upload occurred and cannot authorize an automatic retry.

### Recovery Actions Table
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


### Scenario L-TR-05: Windows Maven split lifecycle with native exit code preservation
- **Context:** Windows execution environment using PowerShell and `mvn.cmd`.
- **Behavior:** Runner sets child location to service `execution_root`, passes `-f <manifestPath>`, executes `mvn.cmd -B clean verify`, and captures native exit code. Tests fail with exit code 1. Runner halts immediately without executing `sonar:sonar`. Initial working directory is restored in `finally`, preserving exit code 1 without cleanup masking.

### Scenario L-TR-06: Dynamic task metadata path discovery and saved-task resumption
- **Context:** Maven project where scanner writes task metadata to `target/sonar/report-task.txt`. Runner disconnected during task polling.
- **Behavior:** On resume, runner checks `target/sonar/report-task.txt` (discovered from Maven build directory), extracts verified `ceTaskId`, verifies source checkpoint has zero drift, and queries `sonar api get "/api/ce/task?id=..."` without triggering a new build or upload.
