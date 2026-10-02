# All-Project Advisor History Contract

**Status:** Historical paired host/runner integration; retired 2026-10-02. The producer's history format and project records remain relevant, but `rootIdentity`, plugin installation bindings, runner descriptors, and old UI scopes below are not current Native Advisor contracts. The 2026-09-24 paired release qualification is historical evidence only.

This guide records the former EVCrate/DamHopper plugin boundary for all-project history. The native DamHopper reader uses the server process `$HOME/.evcrate/advisor-history` and does not require root-identity registration, plugin context, or runner admission.

## Versioning and compatibility

- `evcrate-advisor-data` v2 adds explicit history scope/query metadata while retaining the same eight method names. Version 1 schemas and semantics remain supported and unchanged; on-disk execution/outcome history also remains v1.
- The generated contract manifest advertises supported versions `1` and `2`. Keep the host SDK, worker, UI bridge, generated schemas, and fixtures paired during rollout; reject incompatible contract versions rather than silently weakening v1 validation.

## Scope and project filtering

Root history is a separate authority from configured host targets. The agreed owner-root policy allows every authenticated account on that server to read retained history, without per-account grants or historical project registration. The trusted plugin installation binds the owner's history root; the host/runner contract requires reauthorization of the authenticated actor, installation, source, and current revisions. A configured-target `*` grant, browser-provided path, or project display name does not grant root access.

The v2 `history.summary` and `history.page` query includes `project_id: string | null`:

- In `history-root` scope, `null` means All Projects; a SHA-256 project ID selects one discovered project.
- In `project` scope, the context remains bound to its one project; a query cannot widen it to root history or another project.
- Refresh derives its source from the trusted context, not a caller-supplied wildcard target or filesystem path.

## Snapshot inventory

Refresh and summary expose the per-project inventory for the same bounded history snapshot; the inventory is independent of active project/task/metric filters. Summary results include it, while refresh may return `null` when no inventory is available. Each item contains a canonical `project_id`, nullable display `label`, and record `count`:

```json
{"project_id":"<sha256>","label":"Example","count":12}
```

The inventory is capped at 500 unique entries. Its `total_projects` and `unfiltered_total_records` describe the snapshot before query filtering; Phase 05 observed 21 projects / 237 accepted consultations, not contract constants.

## Versioned owner-safe display metadata

The sidecar is versioned independently from the data API. Version 1 maps canonical project IDs to display metadata:

```json
{"version":1,"projects":{"<sha256>":{"name":"Example","updated_at":1720000000000}}}
```

The EVCrate history writer records a sanitized project basename once in a `project-metadata.json` sidecar keyed by project ID under the cross-platform trusted-files policy (written atomically without UID/SID/0600 mode restrictions; prior owner-only requirement superseded); metadata failures do not block consultation history. The worker checks the project-local sidecar first, then the root-level map. If neither has a valid name, the label is `null` and the UI can show an abbreviated project ID. Names are display-only, never identity or authorization; strict validation rejects leading/trailing whitespace, control characters, path separators, `~`, HOME/USERPROFILE references, and escaped control sequences. Do not infer labels from filesystem paths or expose absolute HOME paths.

## Historical plugin runner scope descriptor (retired)

The companion runner protocol defines:

```ts
type ContextScopeKind = 'project' | 'history-root';

interface ContextScopeDescriptor {
  kind: ContextScopeKind;
  rootIdentity?: string;
  sourceRevision?: number;
}
```

`context.open` accepts the optional descriptor; its result may include `scopeKind` identifying the established scope. The matching Rust host contract serializes the scope kind as `project` or `history-root` and uses camel-case descriptor fields. This typed scope distinguishes owner-root history from a single project context; host authorization and revalidation remain the authority.

## Historical plugin host authorization and context (retired)

DamHopper persists an installation-bound `OwnerHistorySource` with `rootPath`, `rootIdentity` (64-character lowercase SHA-256), positive `sourceRevision`, and `allAuthenticatedHistoryRead`. An administrator supplies it during installation approval or replaces it with an expected security revision; replacement advances registry and security revisions.

An authenticated actor with a valid session epoch may enter `history-root` scope only when the installed source enables account-wide history. Without an explicit user grant, the host permits only `history.refresh`, `history.summary`, `history.page`, and `history.detail`. `--no-auth` remains denied; project scope and policy/evaluation operations retain their existing grant checks. A configured-target `*` grant alone does not authorize root history.

Before each `context.open`, the API reads the enabled installation from the runner and refreshes its process-local source cache when configured. This is per-open hydration, not startup hydration. It sends a typed descriptor containing scope kind, root identity, and source revision; the descriptor does not carry the owner root path.

The runner independently checks the persisted enabled installation, root-history capability, and descriptor identity/revision. It rejects missing, symlink, or non-directory roots. The cross-platform trusted-files policy has no filesystem UID-ownership gate.

Revision-guarded source replacement clears the API source cache and invalidates that installation's contexts; the next open rehydrates the current source from the runner. Phases 02–04 complete host authorization, owner-safe scanning/name persistence, and snapshot-backed project filtering/source labels. Phase 05 completed paired qualification; see the evidence summary below. The 21-project / 237-consultation result is an observation, not a contract constant.

**Evidence:** [Phase 02 plan](../plans/260924-1055-all-project-advisor-history/phase-02-host-authorization-context.md), [validation](../plans/reports/tester-260924-1424-phase02-host-root-authorization-context.md), and [review](../plans/reports/code-review-260924-1436-phase-02-host-root-authorization.md).

## Historical plugin Root Identity (SHA-256) configuration (retired)

`rootIdentity` bound an owner history root to the former DamHopper plugin
installation. Native DamHopper Advisor reads the server process HOME history
directory directly and has no root-hash admission/configuration field. The
producer-side `projectId` in history records is a separate domain identifier
and remains part of the retained history format.

### Root Identity vs. Project ID

- **Root Identity (`rootIdentity`)**: SHA-256 digest of the canonical advisor history root directory path (`~/.evcrate/advisor-history`). Binds `OwnerHistorySource` on the DamHopper installation; authorises account-wide history reads across all projects.
- **Project ID (`projectId`)**: SHA-256 digest of an individual project workspace path. Partitions consultation history on disk (`~/.evcrate/advisor-history/<project-id>/<task-run-id>/<consultation-id>`) and indexes names in `project-metadata.json`.

### Canonical requirements and invariants

1. **Path normalization**: The history root must be an existing, absolute, canonical directory without symlink or ancestor symlink components (`fs::canonicalize(path) == path`).
2. **Ownership safety**: On Unix, the directory must not be owned by `root` (UID 0).
3. **Digest format**: Lowercase hexadecimal string of length exactly 64 (`/^[0-9a-f]{64}$/`).

### How to generate Root Identity

#### Bash / CLI
```bash
# Resolve canonical path (no symlinks, no dot segments)
CANONICAL_ROOT=$(realpath -e "$HOME/.evcrate/advisor-history")

# Generate 64-char lowercase SHA-256 hex digest
ROOT_IDENTITY=$(printf '%s' "$CANONICAL_ROOT" | sha256sum | awk '{print $1}')

echo "Path:     $CANONICAL_ROOT"
echo "Identity: $ROOT_IDENTITY"
```

#### Rust (DamHopper host / runner)
```rust
use sha2::{Digest, Sha256};
use std::path::Path;

pub fn compute_root_identity(raw_path: &Path) -> Result<(String, String), std::io::Error> {
    let canonical = raw_path.canonicalize()?;
    let path_str = canonical.display().to_string();

    let mut hasher = Sha256::new();
    hasher.update(path_str.as_bytes());
    let root_identity = hex::encode(hasher.finalize());

    Ok((path_str, root_identity))
}
```

#### Node.js / TypeScript (Tooling / worker)
```typescript
import fs from 'node:fs';
import { createHash } from 'node:crypto';

export function computeRootIdentity(rawPath: string): { canonicalPath: string; rootIdentity: string } {
  const canonicalPath = fs.realpathSync.native(rawPath);
  const rootIdentity = createHash('sha256').update(canonicalPath, 'utf8').digest('hex');
  return { canonicalPath, rootIdentity };
}
```

### Provisioning in DamHopper

DamHopper stores this configuration in `OwnerHistorySource`:
- `rootPath`: Canonical absolute path (e.g. `/home/user/.evcrate/advisor-history`). Kept host-side; never sent to iframe/UI.
- `rootIdentity`: 64-character lowercase SHA-256 digest.
- `sourceRevision`: Positive integer (initially `1`).
- `allAuthenticatedHistoryRead`: `true` to allow all authenticated accounts to access history-root.

#### Method 1: DamHopper Admin REST API
Update an existing plugin installation:
```http
PUT /api/plugins/admin/installations/evcrate.advisor/owner-history-source HTTP/1.1
Content-Type: application/json
Authorization: Bearer <ADMIN_SESSION_TOKEN>

{
  "expectedSecurityRevision": 1,
  "ownerHistorySource": {
    "rootPath": "/home/user/.evcrate/advisor-history",
    "rootIdentity": "78be05fd4e2291fb9eb0b5f9e1cf560bc8e14f7d78406d29a5d86f878ceb69f8",
    "sourceRevision": 1,
    "allAuthenticatedHistoryRead": true
  }
}
```
Updating the source advances the host security revision, clears the API-level in-memory cache, and revokes active contexts immediately.

#### Method 2: Staged installation approval
Supply `OwnerHistorySource` during stage approval via `LifecycleCoordinator::approve_and_install_stage` in DamHopper server.

### Verification and fail-closed runtime flow

1. **Context Open (`api_service.rs`)**: DamHopper API checks authenticated session and installation capability, strips `rootPath`, and sends `ContextScopeDescriptor { kind: "history-root", rootIdentity, sourceRevision }` to the runner.
2. **Runner Supervisor (`worker_supervisor.rs`)**: Verifies `root_path.canonicalize() == root_path`, non-symlink, non-UID-0, and checks `req.root_identity == owner_source.root_identity`.
3. **Worker Admission (`context-table.cjs`, `binding.cjs`)**: Locates the history root (`findHistoryRoot`), computes `sha256(fs.realpathSync.native(dir))`, and verifies exact equality with `scopeDescriptor.rootIdentity`. Rejects with `SOURCE_NOT_CONFIGURED` if hashes mismatch.

## Owner-safe all-project history worker (Phase 03)

The worker uses its configured history root for `history-root` scope; callers cannot supply a scan path. Root scans traverse sorted SHA-256 project IDs and non-symlink directories under shared project/task/consultation, record, and byte budgets, operating under the cross-platform trusted-files policy (filesystem UID gates removed). Cap exhaustion marks the snapshot incomplete. Project scope stays bound to its one target.

Bounded reads open files with `O_RDONLY | O_NOFOLLOW`, then validate the opened descriptor's regular-file type, single-link status, and size under the cross-platform trusted-files policy (descriptor owner UID checks removed). Execution/outcome IDs are checked against their enclosing project/task/consultation directories; malformed or mismatched outcome data remains `invalid` rather than being misreported as `missing`, without discarding its valid execution record. Detail rereads compare device, inode, size, and content fingerprints before returning data.

Pagination cursors are HMAC-bound to the snapshot, query hash, and offset. Project selection and filters are covered by the query hash; stable ordering is `started_at` descending, then `project_id`, `task_run_id`, and `consultation_id` ascending.

The candidate builder now reuses `collectPluginPackageRecords` from `scripts/plugin/package-inventory.cjs`, so candidate packaging and manifest inventory share one closure authority.

Phase 03 review approved **9.5/10** with no critical/high findings; it records an optional recommendation to require `rootIdentity` explicitly for `history-root` worker contexts. Verification recorded **354/354 test executions passed**, with no failures or skips; package, candidate-manifest, and distribution checks passed.

**Evidence:** [Phase 03 plan](../plans/260924-1055-all-project-advisor-history/phase-03-worker-history-provider.md) and [review](../plans/reports/code-review-260924-1628-phase-03-owner-safe-history-worker.md).

## Paired qualification and release decision (Phase 05)

The 2026-09-24 qualification reconciles 273/273 cross-repository test executions (0 failed, 0 skipped), deterministic candidate and distribution package verification, and a 9.8/10 review with no critical findings. The direct history-root provider read accepted 237 of 237 consultations across 21 projects in 191.48 ms with no diagnostics. It was not a new live DamHopper browser session, and production deployment is not claimed.

**Evidence:** [Release Evidence Manifest](../plans/reports/release-evidence-manifest-260924-2140-phase-05.md), [test report](../plans/reports/tester-260924-2115-phase-05-paired-qualification.md), and [code review](../plans/reports/code-review-260924-2125-phase-05-paired-qualification.md).

- The EVCrate history producer and on-disk consultation format are the maintained data source; see current package source and the core Advisor controller map in [Codebase Summary](./codebase-summary.md).
- The plugin contract, backend, runner, SDK, and paired UI source-map paths below were removed; phase plans and reports remain historical.
- Paired all-project history Phases 00–05 and their 2026-09-24 qualification are historical integration evidence, not current Native Advisor qualification. See the [project plan](../plans/260924-1055-all-project-advisor-history/plan.md) and [Release Evidence Manifest](../plans/reports/release-evidence-manifest-260924-2140-phase-05.md).
