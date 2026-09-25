# Host authorization research

- `server/src/plugins/authorization.rs:179-200,209-229` and `registry_query.rs:15-29`: `*` in configured-target grants covers host-configured projects only; UI visibility still needs a binding. It is not an owner-history-root grant. `server/src/plugins/api_service.rs:223-310` opens one target through workspace resolution; `worker_supervisor.rs:275-309` forwards one configured target to worker. Current context cannot represent all historical directories.
- `server/src/plugins/contract.rs:170-191`, `registry_state.rs:92-109`, `runner_server.rs:431-439`: context/open payload, security revision and runner dispatch need coordinated contract revision. Bind scope to actor/installation/root/grant revision, not browser supplied path; reauthorize invoke, revoke on changes.
- To include 21 historical projects not registered as host projects, propose administrator-approved owner-history-root *read* grant with server-owned root identifier, confined child IDs and history-only operations. Alternative: register every historical project then grant each; tighter but cannot promise all 230 without that prerequisite. Keep policy/evaluation grants unchanged. Existing `*` grant is not sufficient.
- `server/src/api/auth.rs:352-383,476-489` unconditionally mints JWT when `db.is_none()` without credentials, including supplied username: high-priority fail-open. `apps/web/index.html:8-17` ships unconditional first-visit `authType: 'none'`/auto-connect profile and hardcoded `evcrate`; test-only bootstrapping belongs in explicit test server fixtures. `server/src/bin/dam-hopper-plugin-test-server.rs:254-258,316-317` grants dev-user wildcard in test server.
- Host UI `packages/ui/src/plugins/use-plugin-navigation.ts:91-99` maps any id longer than 20 chars to `EVCrate Advisor`, mislabeling other plugins. Use trusted manifest title/publisher and a generic fallback.

## Unresolved questions

- How to provision/account-authorize owner-history-root grant when host API UID differs from history owner UID: runner-owned root approval and caller scope need explicit gate and test deployment evidence.
