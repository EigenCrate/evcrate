# Test and Coverage Verification

This reference defines rules for test execution, coverage evidence, threshold verification, and quality gate correlation across languages, while retaining optional Java/JaCoCo recipes.

## 1. Neutral Test Execution Principles

Inspect repository manifests and configuration to determine the project's native runner:

1. **Requirement contract vs observations:**
   - Distinguish test requirements (`required`, `optional`, justified `not-applicable`) from execution observations (`available/passed`, `available/failed`, `unsupported`, `unavailable`).
   - Applicable required tests must execute and pass. A failed test run or `0/0` executed tests is never success when tests are required.
   - For profiles where tests are preflight-approved as justified `not-applicable` (e.g., pure documentation, static assets, or declarative schema repositories), never force Maven, test runners, XML reports, or a nonzero test count.
2. **Focused feedback vs full suite:**
   - Run focused test selectors during development for rapid feedback on modified components.
   - A focused run is feedback only. Before claiming completed testing or generating coverage evidence, execute the repository's clean test lifecycle.
3. **Test fix standards:**
   - Maintain meaningful, specific assertions; avoid blanket test suppression, swallowed errors, or broad mock lenient stubs.
   - For exception assertions (such as JUnit `assertThrows`, pytest `raises`, or Jest `toThrow`), move complex fixture and argument construction outside the assertion lambda so only the expected invocation is exercised.
   - Stub production signatures accurately; remove dead fixture setup.

## 2. Coverage Evidence Rules

Coverage verification requires strict mathematical, temporal, and contractual integrity:

1. **Scope and metric binding:**
   - Explicitly bind the quality gate's metric (line, instruction, or branch/condition coverage), operator (`>=`, `>`), threshold value, target modules, exclusions, and overall vs new-code scope.
   - Never conflate overall coverage with new-code period coverage, nor local proxy counters with SonarQube remote metrics.
2. **Two-factor freshness and report validity:**
   - Verify coverage report freshness via the canonical two-factor validation defined in [Project discovery](project-discovery.md): (a) temporal ordering (artifact timestamp strictly newer than commit time and newest mtime of source, test, and config files) AND (b) source binding (provenance record matching the tested commit SHA, active input content digest, and producing command). Never reuse stale, unverified, or pre-existing reports.
   - Coverage reports must be fully parseable and uncorrupted. Stale, malformed, or unbound reports must be rejected as invalid evidence.
3. **Counter and denominator rules:**
   - **Zero denominator:** If total executable lines or branches are zero (`0/0`), the result is undefined/empty; never treat a zero denominator as 100%.
   - **Unsupported metrics:** If a language toolchain does not report branch coverage, treat branch coverage as `unsupported`, not implicitly satisfied or N/A.
4. **Granular coverage work items and verification separation:**
   - Distinguish high-level gate metrics (`Coverage summary and checks`) from actionable line and branch gaps (`Coverage work items`).
   - Ground precise gaps in the agent's fresh native coverage reports together with source code inspection; Sonar aggregate counts cannot infer exact line ranges, branch condition paths, or new-code scope. The offline converter provides no automated native parser (e.g. JaCoCo XML or LCOV parser) or gap inference; supplied work items observe evidence directly.
   - Work items carry a stable parent-assigned identifier (`id`) that tracks across cycles and line moves without conflating target scopes; no Sonar finding issue ID is assigned to coverage.
   - Behavior gaps and required assertions are recorded in Detail and Test to add; metadata (id, scope, cycle, analysisId, provenance) stays in Detail without extra columns.
   - Passing local tests do not establish improved coverage without fresh coverage measurements.
   - Server aggregate metrics or quality gate passes do not certify specific branch tasks without fresh matching granular evidence; when unverified, retain explicit unverified or unavailable state.
   - Missing or empty work items represent unavailable evidence, never proof that zero coverage gaps remain.
## 3. Complexity Remediation and Behavior Preservation (`java:S3776` and Cognitive Complexity)

Refactoring methods flagged for high cognitive or cyclomatic complexity (such as SonarQube rule `java:S3776` for cognitive complexity, or language-specific cyclomatic complexity rules) requires strict behavioral discipline to avoid introducing regressions into business logic.

### Refactoring Hazard
Cognitive and cyclomatic complexity refactoring fundamentally reshapes control flow, conditional branching, nesting depth, loops, and method boundaries. When reorganizing complex logic without adequate guardrails, developers risk silently altering edge-case handling, inverted condition evaluations, error paths, or subtle side-effect sequencing.

### Rock Foundation Protocol
To guarantee behavioral preservation, follow this protocol strictly in order. Complete the assessment, characterization, assertion review, and passing original-code baseline before modifying production code:

1. **Pre-refactor assessment:**
   - Inspect existing unit tests covering the flagged method and enclosing class.
   - Evaluate whether existing tests form a rock-solid behavioral foundation covering the method's observable business requirements, branching decisions, boundary conditions, and edge cases.
   - If existing tests are adequate, they become the designated characterization suite.
2. **Characterization test authoring:**
   - If existing tests are absent, incomplete, or inadequate, author characterization unit tests FIRST, before altering any production code.
   - Systematically characterize current behaviors across nominal inputs, boundary values, empty or null inputs, branch permutations, expected exceptions, and observable state transitions or side effects.
3. **Observable assertion standard:**
   - Assertions must verify strictly externally observable contracts: return values, output payloads, thrown exceptions, public state transitions, and external collaborator side effects (e.g., verified mock interactions).
   - NEVER assert internal implementation structure, private helper method invocations, intermediate variable states, or extracted helper method names. Tests must validate *what* the method accomplishes, not *how* it is decomposed internally. Ensure assertions satisfy these standards before establishing the baseline.
4. **Attributable baseline execution:**
   - Execute the characterization suite (whether newly authored or existing designated tests meeting the observable assertion standard) against the **unchanged original implementation**.
   - Verify that all characterization tests PASS. A failed test run or zero executed tests (`0/0`) must strictly block refactoring until resolved.
   - Record the original source identity, test selectors, execution command, and actual counts/results in the result record to establish an undisputed, attributable behavioral baseline oracle.
5. **Code split and refactor:**
   - Safely split, decompose, and extract cohesive helper methods or modular structures to reduce the finding's applicable complexity metric below its configured rule threshold. `java:S3776` evaluates cognitive complexity; reducing cognitive complexity below threshold does not require simultaneously reducing cyclomatic complexity unless a distinct cyclomatic rule applies.
   - Keep extracted helpers focused, appropriately scoped (private or package-private), with cohesive responsibilities and explicit parameter passing.
6. **Post-refactor proof:**
   - Rerun the exact same characterization tests without modifying, removing, or weakening any assertions.
   - If any characterization assertion fails, treat the failure as an implementation defect in the refactored code—never weaken or alter the test.
   - After characterization tests pass, execute the repository's clean native test suite to verify zero regressions across callers and the broader codebase.

### Coverage vs. Assertion Strength
- **Execution vs. verification:** Coverage metrics (such as JaCoCo line, branch, or instruction coverage, or LCOV) measure code execution paths, not assertion rigor or functional correctness.
- **The behavioral oracle:** High coverage with shallow or absent assertions provides false confidence. Passing behavioral assertions executed against the original code constitute the true behavioral oracle; coverage metrics verify execution presence but cannot substitute for behavioral proof.

## 4. Optional Java and JaCoCo Recipes

For Java repositories using Maven and JaCoCo, apply these established recipes:

### Focused test execution
```powershell
mvn '-Dtest=ClassName#methodName' test
```
Confirm Surefire executed the target method and record counts.

### Clean module lifecycle and XML generation
Run `mvn clean test` (or `mvn clean verify` when coverage report generation is bound to verification/integration phases) in the approved target `execution_root` to ensure fresh XML at `target/site/jacoco/jacoco.xml` (or aggregated multi-module path `target/site/jacoco-aggregate/jacoco.xml`). Standalone offline coverage parsing does not require Git; relative report paths resolve against the caller's initial directory, while delegated invocations pass absolute report paths bound to the verified `execution_root` per [Project discovery §2](project-discovery.md#2-three-root-execution-context-and-identity-validation).

### Local JaCoCo calculation helper

Cross-platform Node JaCoCo helper (`scripts/calculate-jacoco-coverage.mjs`, Node >=22.19.0 ESM):

```bash
node <installed-skill-root>/scripts/calculate-jacoco-coverage.mjs [--report-path <path>] [--threshold <0..100>] [--include-pattern <regex>]
```

Supported options:
- `--report-path <path>`: Path to `jacoco.xml` (default: `target/site/jacoco/jacoco.xml`). Relative paths resolve against initial caller working directory.
- `--threshold <val>`: Strict combined-coverage threshold percentage (default: `95`). Evaluated using exact BigInt rational arithmetic without floating-point rounding.
- `--include-pattern <regex>`: Optional case-insensitive regex matching class names to include (uses JavaScript RegExp with `i` flag).
- `--help`: Display usage help (must be used alone).

Aggregation & Exit Codes:
- Aggregates direct child `LINE` and `BRANCH` counters of matched classes only; ignores method, sourcefile, package, group, or report counter elements.
- Every evaluated class requires a direct `LINE` counter; missing `LINE` is invalid input (exit 1). Present zero-valued `LINE` counters are valid.
- Absent `BRANCH` counters are treated as undefined/empty and do not fail the combined metric.
- Exit 0 on strict pass (`(covered lines + covered branches) / (total lines + total branches) * 100 > threshold`), exit 1 on invalid arguments, missing file, malformed XML, or invalid counters, exit 2 on threshold failure or empty matched aggregate.

The helper calculates local proxy `(covered lines + covered branches) / (total lines + total branches) * 100` using a strict `>` threshold (e.g., exactly 95.0% fails `>95%`). It provides local feedback only and cannot prove remote quality gate satisfaction.

## 5. Remote Gate and Analysis Correlation

When remote gate verification is required, follow [CLI commands](sonar-cli-commands.md) and [Local analysis](local-analysis.md) for the active project key and revision. Missing credentials, missing scanner, stale analysis, or mismatched branch scope leaves the gate blocked/unverified, not complete.