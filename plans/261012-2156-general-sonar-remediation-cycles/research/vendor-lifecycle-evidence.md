# Vendor lifecycle and evidence — planning research

**Qualification scope revised:** [Validation decisions](../validation-decisions.md) remove new live runs from extension completion. Vendor/runtime rules below still apply when an actual consumer requests server-qualified remediation; no current live qualification implied.

Date: 2026-10-12. Source: terminal result `SonarVendorContracts`, original brainstorm vendor reads. Documentation-backed, not live-qualified. Parent synthesis removes universal/version-specific assumptions from raw recommendations.

## Primary references

- [Scanner CLI / dedicated-scanner boundaries](https://docs.sonarsource.com/sonarqube-server/analyzing-source-code/scanners/sonarscanner/)
- [.NET scanner lifecycle](https://docs.sonarsource.com/sonarqube-server/analyzing-source-code/scanners/dotnet/using/)
- [Coverage import](https://docs.sonarsource.com/sonarqube-server/analyzing-source-code/test-coverage/overview/)
- [Background tasks](https://docs.sonarsource.com/sonarqube-server/analyzing-source-code/background-tasks/)
- [Sonar CLI schema](https://www.sonarsource.com/sonarqube/cli/llms.txt)
- [Client-specific TLS](https://docs.sonarsource.com/sonarqube-server/analyzing-source-code/scanners/scanner-environment/manage-tls-certificates/)

## Contract conclusions

1. Discover approved scanner family/version and actual ordered lifecycle. Dedicated Maven/Gradle/.NET scanners cannot be replaced by generic CLI merely for convenience.
2. .NET has begin → build/tests/coverage → end; begin can change rules and disable WarningsAsErrors. Required uninstrumented native verification may need its own run. Version-specific build-server/incremental flags and token/truststore mechanisms are optional matching-client guidance, not universal requirements.
3. Coverage must be fresh and readable at its importing/submitting stage. Report tools/formats vary by language; execution reports are separate. Timestamps alone do not establish source freshness—bind report generation to safe input/profile identity and source mapping.
4. Scanner success can mean upload only. Capture actual task metadata; await terminal CE result; correlate returned analysis identity and revision/time; query analysis-bound gate where supported. Example REST endpoints from vendor report are capability discovery candidates, not invented universal CLI flags.
5. Current issue/hotspot endpoints are mutable. Complete pagination plus before/after analysis checks detects some races, not immutable/transactional capture. Record collection window and manual transitions; reject contaminated/unknown snapshots. Server pagination/window limits vary; discover them and require complete capture or block—never narrow agreed scope to fit a limit.
6. API/CLI-session auth and scanner-process auth are independent. No token extraction, secret-valued prompts/logs, TLS bypass, or automatic trust/tool changes.
7. Multi-target source checkpoints and independent task/analysis/gate/evidence identities are mandatory; one passing gate cannot qualify repository success.

## Acceptance shapes

| Shape | Required proof |
|---|---|
| Build-integrated | Approved native lifecycle includes required checks/coverage before importing goal; coherent source identity |
| Standalone | Native verification and applicable coverage complete before scanner imports; report-source mappings checked |
| Preparation/build/submission | Preparation before instrumented build; fresh reports before finalization; native semantics separately qualified when required |
| Mixed modules / targets | No incompatible metric aggregation; independently correlated evidence for every target at same source checkpoint |

Negative scenarios: unsupported edition/analyzer, secret-auth gap, required unsupported coverage, stale or malformed reports, wrong branch/PR, concurrent analysis, manual finding transitions, paging ceiling, failed CE, source generation drift. None may produce success.

## Verification limits

No project tests, scanner uploads, live auth, CE polling, target quality gate, host permission enforcement or all-framework qualification exercised by this research. Examples are lifecycle shapes—not mandatory recipes or real runtime results.

## Unresolved questions

Resolve actual projects, approved commands/scanners, compatible server APIs, safe process credentials, native subagent support, and privacy/retention with owners during implementation qualification. No new user design decision needed now.
