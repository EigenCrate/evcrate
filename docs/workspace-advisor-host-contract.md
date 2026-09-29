# Workspace Advisor Host Admission and Identity

**Status:** Phase 01 host admission completed and approved (9.2/10); Phase 02 history-scope qualification completed and approved (9.6/10) on 2026-09-29. Phases 03–09 and end-to-end rollout remain pending.
**Authority:** DamHopper host API/client implementation; see the [Phase 01 record](../plans/260929-1346-advisor-workspace-panel/phase-01-host-admission-and-identity.md) and [frozen architecture contract](../plans/260929-1346-advisor-workspace-panel/architecture-contract.md).

This document records the selected-project `describeView` API and the trusted identity/authorization boundary between the Workspace host and Advisor. The descriptor is discovery metadata for opening the existing context; it is not an access token and does not authorize later reads by itself.

## API

The host UI client exposes `plugins.describeView(request)` and maps the `plugins:describeView` transport operation to `POST /api/plugins/view-context`. The route enforces a 16 KiB request-body limit.

```ts
interface DescribeViewRequest {
  installationId: string;
  target: ServerProjectTarget;
}

interface ServerProjectTarget {
  project: string;
  worktreePath?: string;
}

interface WorkspaceProjectIdentity {
  projectId: string;
  label: string | null;
}

type HistoryScopeKind = 'history-root' | 'project' | 'unavailable';
type ContextScopeKind = 'history-root' | 'project';

interface PluginViewContext {
  metadata: PluginMetadataItem;
  workspaceProject: WorkspaceProjectIdentity;
  historyScope: HistoryScopeKind;
  contextScope: ContextScopeKind;
  allowedOperations: string[];
  allowCurrentAccountPolicy: boolean;
  authorityKey: string;
}
```

The server uses camel-case wire names and rejects unknown request fields. The host transport selects the connection owned by the selected Workspace project; `ServerProjectTarget` deliberately omits the UI's `profileId`. `target.project` is required; `worktreePath` identifies a selected worktree when present. There is no profile-only, null-target, or caller-computed-identity form.

## Admission and canonical identity

1. The server rejects `--no-auth` plugin access and requires an authenticated actor. It resolves the named configured project and optional worktree through the existing workspace target resolver. Empty and unavailable/unregistered projects fail; there is no first-project, default-profile, or arbitrary history-root fallback.
2. The server verifies that the installation is enabled and visible to the actor for the selected configured target. Safe public metadata is returned; `ownerHistorySource` is redacted to `null`, so its runner-only filesystem path is not disclosed.
3. The server canonicalizes the resolved target directory using `dunce::canonicalize`. It rejects non-directories, paths that cannot be represented as UTF-8, NUL bytes, and the filesystem/drive root. It computes `projectId` as lowercase hexadecimal SHA-256 over the exact UTF-8 bytes of the canonical target path. A selected worktree therefore has the identity of its resolved directory.
4. `label` is presentation only: the configured project name, with the selected worktree branch where applicable. It is neither the project identity nor authority. The browser must not hash a label, normalize a path into an authoritative ID, or supply `projectId` or a history root.

The canonical identity intentionally follows the history writer's path-and-hash rules. Lossy path conversion is not an identity fallback; unsupported path encoding fails explicitly.

## Effective scopes and operations

`historyScope` describes the history authority available to this actor: `history-root` for an enabled installation-bound owner history source, `project` when existing project grants authorize history operations, and `unavailable` when no history operation is authorized. `contextScope` reports only an existing runner scope (`history-root` or `project`); it is not a third source or profile scope.

The server intersects the active installation's advertised capabilities with the actor's effective authorization. An enabled owner-history source grants authenticated users only the four root-history reads: `history.refresh`, `history.summary`, `history.page`, and `history.detail`. It does not grant policy or evaluation access. `policy.readCurrent` and evaluation operations still require their existing grants. The host can describe policy/evaluation-only access with `historyScope: 'unavailable'` and `contextScope: 'project'`; lack of history permission does not erase otherwise permitted operations. When opening a mixed root context, the host checks non-history operations against their explicit grants rather than requiring root-history operations to be re-granted.

## Authority key and revalidation

`authorityKey` is an opaque SHA-256 equality/fencing value derived from the installation ID, active package digest and generation, actual context scope, host security revision, owner-history source revision, and the configured target when authority is target-bound (otherwise a global marker). It is stable across selected-project changes under unchanged root/global authority; target-bound authority changes remain target-bound. The host selects the owning connection when creating the client; actor/session authorization is checked separately by authenticated routes and context-open/invoke epoch fencing. Treat the key as metadata, never as a credential or bearer token.

`describeView` does not open a runner context or grant a durable capability. UI-asset reads recheck actor/target visibility, installation state, and activation digest/generation. Context open and every invocation continue to revalidate the actor/session epoch, installation, target, operation, source, and revisions as applicable. Revoked actors, changed sources, or stale revisions must still be denied.

## Implementation map

- UI request/response types, client method, and WebSocket mapping: `packages/ui/src/api/{plugin-types,client,ws-transport}.ts`.
- HTTP request DTO, route, and body limit: `server/src/api/{plugins,router}.rs`.
- Descriptor resolution, capability intersection, and response contract: `server/src/plugins/{api_service,authorization,contract}.rs`.
- Admission and permission behavior: `server/tests/{plugin_api_integration,plugin_authorization}.rs`.

## Behavioral evidence and limits

The Phase 01 record reports **102 passed, 0 failed** across server integration/authorization, SDK contract, and UI checks. `test_describe_view_api_behavioral` covers unauthenticated denial, unknown and empty project rejection, rejection of forged `projectId`/`root`, canonical ID parity, safe metadata, and stable `authorityKey` across A→B under unchanged global root authority. Authorization tests cover the four implicit history operations, project-only history, policy/evaluation-only access without history, and mixed-context grants.

These checks establish repository/API behavior, not the later Workspace iframe lifecycle, phase-paired history behavior, LAN qualification, production deployment, or the complete Workspace rollout. Phase 01 intentionally leaves runner scope kinds and the existing data API unchanged.
Phase 02 qualified existing EVCrate history behavior: root All preserves valid-ID unmapped activity without registration or a label join, while project scope remains non-widening; production scanner/provider and v1/v2 schema did not change. See the [Phase 02 record](../plans/260929-1346-advisor-workspace-panel/phase-02-history-scope-and-unmapped-records.md) and [review](../plans/reports/code-review-260929-1850-phase-02-history-scope-and-unmapped-records.md).
