# Test and Coverage Verification

## Test execution

Inspect the module POM, Maven wrapper, test plugins, and profiles; use the repository's runner. PowerShell selector example:

```powershell
mvn '-Dtest=ClassName#methodName' test
```

Confirm Surefire actually executed the intended test; record count/failures. `0/0` is not success. Before full-suite or coverage claims, run the clean module lifecycle that executes all required tests and generates JaCoCo XML: `mvn clean test` when configured there, or `mvn clean verify` for report/integration-test phases. A focused run is only feedback.

For test fixes:
- Keep meaningful assertions; no blanket suppression or broad Mockito `lenient()` stubs.
- Move complex argument construction before an `assertThrows` lambda, leaving only the expected invocation; then run the focused selector and confirm nonzero execution.
- Stub the production overload exactly; remove unused setup.

## Coverage evidence

1. Bind the gate's exact metric, threshold/operator, module/files, exclusions, and overall/new-code scope.
2. Verify fresh XML from the clean run at the configured JaCoCo report/aggregate path (often `target/site/jacoco/jacoco.xml`); never reuse stale output.
3. Aggregate only matching classes. The optional PowerShell helper accepts `-ReportPath`, `-Threshold`, and class-name regex `-IncludePattern`:

   ```powershell
   pwsh -File <skill-dir>/scripts/calculate-jacoco-coverage.ps1 -ReportPath <fresh-xml> -Threshold 95 -IncludePattern '<class-regex>'
   ```

   Its local proxy is `(covered lines + covered branches) / (total lines + total branches) * 100`, with a strict `>` threshold. Exactly 95% fails `>95%`. Use unrounded values.
4. Do not equate this proxy or line coverage with Sonar's metric, source-file exclusions, or new-code coverage. Use the helper only when class selection fits; it cannot prove a remote gate.
5. When remote verification is required, follow [CLI commands](sonar-cli-commands.md) for the current gate and issues bound to the tested revision. Missing auth/scanner, stale analysis/report, or mismatched scope means blocked/unverified, not done.