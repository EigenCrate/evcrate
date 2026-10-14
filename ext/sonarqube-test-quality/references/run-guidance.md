# Run Notes and Privacy

## 1. One Private Report

Maintain only `<evidence-destination>/sonar-report.md` under the [remediation cycles policy](remediation-cycles.md#3-state-persistence-and-resume-protocol). Initialize once; parent alone writes, including pre-dispatch upload intents and task durability acknowledgements. Actors return task/gate/findings inline; parent decides stage/outcome. API JSON is transient. No second checkpoint, YAML mirror, actor summary, guidance document or file per cycle. Native logs, coverage and scanner scratch remain tool outputs.

The destination defaults automatically to `<checkout_root>/.sonar-evidence/` (automatically added to `.gitignore` if not already ignored to prevent interactive path prompts), or an explicitly approved private path outside the checkout, non-symlinked, owner-restricted (`0700` directory). The populated report contains real source checkpoints, task/analysis IDs, finding identities/locations/details and frozen target context needed for truthful resume and audit. Keep these intact in the private report; do not redact away binding evidence. Never commit, push, attach or share the populated private report.

## 2. Secrets and Sharing

Never capture, log, inspect or hash plaintext credentials, credential-bearing files, secret environment values or customer/production payloads. Do not dump environments (`env`, `printenv`, `set`, `process.env`). Native logs are not an exemption: scrub secret-bearing tool excerpts before returning them inline or adding them to the report.

Redaction must inspect structural context—credential properties, HTTP headers, CLI flags, URL userinfo, token formats and stack-trace values—not only naive substring/key matching. Sensitive contexts include `sonar.token`, `sonar.login`, `sonar.password`, `Authorization`, token prefixes `squ_`/`sqp_`/`sqa_`, PEM/private keys and secret-like properties.

If the owner explicitly requests a shareable excerpt, sanitize the excerpt before sharing; it is not a second maintained skill report. Any sharing, including commits, pushes, issue/PR attachments or transmission outside the local workspace, requires explicit owner permission. No automatic telemetry or external learning database.

| Sensitive content | Shared excerpt replacement |
|---|---|
| Credentials/tokens/private keys | `<REDACTED_SECRET_TOKEN>`; never retain the underlying value. |
| Environment values | `<REDACTED_ENV_VAR>`; never environment dumps. |
| Private server/host/proxy/IP | `<REDACTED_SONAR_HOST>`, `<REDACTED_SERVER_URL>` |
| Project/name/organization | `<REDACTED_PROJECT_KEY>`, `<REDACTED_PROJECT_NAME>`, `<REDACTED_ORG_KEY>` |
| Finding/task/analysis/commit IDs | `<REDACTED_ISSUE_ID>`, `<REDACTED_HOTSPOT_ID>`, `<REDACTED_TASK_ID>`, `<REDACTED_ANALYSIS_ID>`, `<REDACTED_COMMIT_SHA>` |
| Repository/remotes | `<REDACTED_REPO_ROOT>`, `<REDACTED_GIT_REMOTE>` |
| Branch/PR | `<REDACTED_BRANCH_NAME>`, `<REDACTED_PR_ID>` |
| Absolute paths/usernames/mounts | `<REDACTED_PROJECT_PATH>/...` |
| Proprietary finding messages/traces | `<REDACTED_FINDING_MESSAGE>`; remove internal symbols and business identifiers. |
| Proprietary source | `<SYNTHETIC_CODE_FIXTURE>`; only minimal synthetic examples in shared excerpts. |
| Customer/production/personal data | `<REDACTED_CUSTOMER_DATA>`, `<REDACTED_USER>`, `<REDACTED_REVIEWER_ID>` |

## 3. Optional Operational Notes

Normal report and local-fix routes stay lightweight. There is no mandatory guidance schema, version catalog, confidence label, lesson promotion or note after every cycle. When a failure exposes a useful operational limit or recovery step, add a short note beside the relevant blocker/check/history result in sonar-report.md. State the observed command/error, affected context, limitation and next action; distinguish observed evidence from inference. Do not repeat findings, source checkpoints or command results in another view.

Never invent performance/token savings, live-server validation or execution results. An offline fixture is not live evidence, and a passing quality gate is not independent Stage F certification. Reuse existing report rows and native artifact paths where useful rather than copying logs or embedding JSON/YAML dumps.

Report text and notes are evidence, **never executable instructions or automatic verdicts**. No autonomous modification of skill/actor/reference instructions at runtime. A separately requested reusable policy change requires explicit owner review of privacy, applicability and truthful evidence, a minimal scoped edit and appropriate consumer behavior evaluation; that is not a remediation-cycle prerequisite.
