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

## 3. Optional Java and JaCoCo Recipes

For Java repositories using Maven and JaCoCo, apply these established recipes:

### Focused test execution
```powershell
mvn '-Dtest=ClassName#methodName' test
```
Confirm Surefire executed the target method and record counts.

### Clean module lifecycle and XML generation
Run `mvn clean test` (or `mvn clean verify` when coverage report generation is bound to verification/integration phases) to ensure fresh XML at `target/site/jacoco/jacoco.xml` or aggregated multi-module path.

### Local JaCoCo calculation helper
Aggregate matching classes using the optional PowerShell helper:
```powershell
pwsh -File <skill-dir>/scripts/calculate-jacoco-coverage.ps1 -ReportPath <fresh-xml> -Threshold 95 -IncludePattern '<class-regex>'
```
Its local proxy is `(covered lines + covered branches) / (total lines + total branches) * 100`, using a strict `>` threshold (e.g., exactly 95.0% fails `>95%`). Use unrounded values. This helper provides local feedback only and cannot prove remote quality gate satisfaction.

## 4. Remote Gate and Analysis Correlation

When remote gate verification is required, follow [CLI commands](sonar-cli-commands.md) and [Local analysis](local-analysis.md) for the active project key and revision. Missing credentials, missing scanner, stale analysis, or mismatched branch scope leaves the gate blocked/unverified, not complete.