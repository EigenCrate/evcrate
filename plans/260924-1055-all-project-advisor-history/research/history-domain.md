# Scoped history domain research

- `src/protocol/advisor-metrics.ts:19-22` already defines project/history-root scope; `normalizeHistoryRecord` ties outcomes to project/task/consultation identity (`:41-59`). Keep on-disk history v1.
- Frozen plugin data v1 is strict: `src/protocol/advisor-plugin-data-api.ts:296-333,447-477` queries reject additional project filters; generate a coordinated plugin data v2 via `scripts/generate-advisor-plugin-data-schema.mjs`, update worker `plugin/backend/data-api.cjs`, manifest/fixtures, provider/bridge; do not silently relax v1.
- Current scan is single-project (`plugin/backend/history-scanner.cjs:56-75`). Aggregate scanning must remain cooperative, owner-safe, bounded and enforce `execution.project_id == directory ID`; share total 256 MiB read budget, deadline, diagnostic accounting, snapshot cap. `:132-153` record_ref currently hashes task/consultation, so include project ID for deterministic uniqueness. Never use a client-supplied root path.
- `plugin/backend/history-provider.cjs:58-153` owns scan/snapshot and summary/page/detail; `snapshot-store.cjs:14-37,72-105` has 2/context, 128 MiB estimated cap and 5-minute TTL. Retained normalized records must include project identity; inventory counts should come from the same snapshot, independently of active filters.
- `plugin/backend/cursor-manager.cjs:61-85` currently only applies outdated `filters.status`, `has_outcome`, `outcome_result` while v1 query uses plural arrays; scope work must fix parity with metric filters, deterministic project tie breaker, and bind project selection to HMAC query. Never re-pin wrong behavior.
- Only approved host bindings can provide friendly labels. Unregistered history projects must display short ID fallback; no path extraction from `checkpoint.task.authorized_paths`. User reported 230 consultations / 21 projects (27 evcrate); treat this as observed dataset, not permanent count.

## Unresolved questions

- Root approval/metadata scheme and numeric traversal ceiling require qualification against 21-project data and memory target before freezing revised contract.
