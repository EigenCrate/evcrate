# Workspace Advisor Admission, Identity, UI Bridge, and Persistent Placement

**Status:** Phase 01 admission (9.2/10), Phase 02 history scope (9.6/10), Phase 03 bridge/reusable host (9.7/10), and Phase 04 EVCrate viewer scope/request state (9.5/10) completed and approved on 2026-09-29. Phase 05 persistent placement is Cycle 2 review-approved (9.8/10); Phase 06 compact views and Phase 07 Configuration/Evaluations disclosures completed 2026-09-30 (10/10 and 9.6/10 Cycle 2 reviews). Phase 08 standalone navigation/package cutover completed 2026-09-30 (9.8/10); Phase 09 paired qualification, end-to-end rollout, and production deployment remain open.
**Authority:** DamHopper host API/SDK and paired EVCrate viewer implementation; see the [Phase 01 record](../plans/260929-1346-advisor-workspace-panel/phase-01-host-admission-and-identity.md), [Phase 03 record](../plans/260929-1346-advisor-workspace-panel/phase-03-bridge-and-reusable-host.md), [Phase 03 review](../plans/reports/code-review-260929-2056-phase-03-bridge-and-reusable-host-cycle-2.md), [Phase 04 record](../plans/260929-1346-advisor-workspace-panel/phase-04-viewer-scope-and-request-state.md), [Phase 04 review](../plans/reports/code-review-260929-2154-phase-04-viewer-scope-and-requests.md), [Phase 05 record](../plans/260929-1346-advisor-workspace-panel/phase-05-workspace-panel-placement.md), [Phase 05 review](../plans/reports/code-review-260929-2332-phase-05-cycle-2-workspace-panel-placements.md), [Phase 05 evidence handoff](../plans/reports/docs-manager-260929-2357-phase-05-persistent-workspace-placement.md), and [frozen architecture contract](../plans/260929-1346-advisor-workspace-panel/architecture-contract.md).

This document records selected-project `describeView` admission and the trusted identity/authorization boundary between the Workspace host and Advisor, the negotiated UI bridge and reusable host lifecycle, and Phase 05 persistent Workspace placement. Descriptors and bridge context are not access tokens; every asset read, context open, and operation remains subject to host authorization.

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

## UI bridge extension

The SDK (`packages/plugin-sdk/src/ui-bridge.ts`), host (`packages/ui/src/plugins/bridge-validators.ts`), and EVCrate viewer (`viewer/src/providers/bridge-contract.ts`) pin the bridge protocol to `1.0.0`. The Advisor extension is `workspace-advisor-v1`; generic plugins that do not negotiate it retain the base bridge handshake.

The protocol recognizes these envelopes:

- Base handshake and data path: `host.bootstrap`, `frame.ready`, `frame.portAck`, `request`, `cancel`, `response`, `context.revoked`, and `availability.changed`.
- Advisor extension: `host.contextReady`, `host.workspaceChanged`, and `frame.uiIntent`.

Every envelope is bound to the bridge version, frame session, and activation generation. The host bootstrap includes the plugin ID, effective capabilities, a one-use nonce, and the negotiated extension; the frame acknowledges the nonce over the transferred `MessagePort`. Advisor data is not ready at port receipt or acknowledgement: the host emits `host.contextReady` only after opening the server context and confirming the expected activation and scope. The viewer remains unavailable and queues data calls until this event. Generic plugins retain the base readiness path.

```ts
interface AdvisorWorkspaceContext {
  revision: number;
  authorityKey: string;
  project: { projectId: string; label: string | null };
  historyScope: 'history-root' | 'project' | 'unavailable';
  contextScope: 'history-root' | 'project';
  allowedOperations: string[];
}
```

`projectId` and `authorityKey` are lowercase 64-character SHA-256 identifiers; `label` is nullable presentation text, bounded to 256 characters and free of control characters. `revision` is a positive integer. `historyScope`, `contextScope`, and `allowedOperations` are host-derived, not viewer authority.

`host.workspaceChanged` carries a strictly increasing revision and the same `authorityKey` in the current frame session. The host obtains the selected identity and effective operations from a fresh `describeView` response. Same-root/global-authority project changes update the existing frame/context without reloading it. A changed authority, owner, activation, or invalid update revokes the old session and requires a replacement; this message is not a live history subscription.

`frame.uiIntent` accepts only `activate` or `dismiss`. The host handles it only for a negotiated extension when the session is Ready and visible; it carries no operation, path, or permission. Host validators require exact envelope fields and matching version/session/generation/nonce, allow only the context's operation set, and bound JSON payloads to 16 MiB and control envelopes to 64 KiB. Data requests also have bounded JSON depth/item counts and a maximum 30-second deadline.

## Reusable host contract

`usePluginHost` owns the shared route/embed lifecycle: resolve the selected project, target, and owner connection; obtain Advisor context or generic plugin metadata; verify the UI asset before building the sandboxed document; create and dispose the `FrameSession`; and fence cancellation, revocation, and late results. Missing project/target or a disconnected connection renders an unavailable state without plugin API calls. An owner-generation change revokes synchronously and masks prior-owner content.

When a new selection has the same authority key, the hook keeps the current iframe, MessagePort, and backend context and sends a revisioned `host.workspaceChanged`. If authority differs, it revokes the old session before preparing the replacement. Visibility changes update the session's visible gate without re-preparing it.

`PluginHost` is the reusable presentation component. It accepts installation identity and optional project, target, connection, visibility, UI-intent callback, class, and title overrides. `PluginHostPage` is a thin `AppLayout` route wrapper around it. Phase 05 composes this lifecycle in one persistent Workspace-level host; shell slots provide placement geometry, not another frame lifecycle. Navigation cutover and end-to-end rollout remain separate.

Implementation map: DamHopper `packages/ui/src/plugins/{bridge-host,bridge-validators,use-plugin-host}.ts` and `packages/ui/src/components/{PluginHost,PluginHostPage}.tsx`; EVCrate `viewer/src/providers/{bridge-contract,advisor-data-provider,dam-hopper-port-provider}.ts`.

Phase 03 is DONE with a 9.7/10 Cycle 2 review. Its implementation summary reports 145 test passes across EVCrate and DamHopper; the review records 81 targeted unit, browser, and SDK tests and no critical findings. This Phase 03 evidence predates and does not establish Phase 05 Workspace placement, paired end-to-end rollout, or production deployment.

## Behavioral evidence and limits

The Phase 01 record reports **102 passed, 0 failed** across server integration/authorization, SDK contract, and UI checks. `test_describe_view_api_behavioral` covers unauthenticated denial, unknown and empty project rejection, rejection of forged `projectId`/`root`, canonical ID parity, safe metadata, and stable `authorityKey` across A→B under unchanged global root authority. Authorization tests cover the four implicit history operations, project-only history, policy/evaluation-only access without history, and mixed-context grants.

These checks establish repository/API behavior, not the later Workspace iframe lifecycle, phase-paired history behavior, LAN qualification, production deployment, or the complete Workspace rollout. Phase 01 intentionally leaves runner scope kinds and the existing data API unchanged.
Phase 02 qualified existing EVCrate history behavior: root All preserves valid-ID unmapped activity without registration or a label join, while project scope remains non-widening; production scanner/provider and v1/v2 schema did not change. See the [Phase 02 record](../plans/260929-1346-advisor-workspace-panel/phase-02-history-scope-and-unmapped-records.md) and [review](../plans/reports/code-review-260929-1850-phase-02-history-scope-and-unmapped-records.md).
Phase 04 adds viewer-only activity-scope and request fencing over these unchanged host authorities; see the [Phase 04 record](../plans/260929-1346-advisor-workspace-panel/phase-04-viewer-scope-and-request-state.md) and [review](../plans/reports/code-review-260929-2154-phase-04-viewer-scope-and-requests.md).

## Phase 05 — Persistent Workspace panel placement

`WorkspaceAdvisorPlacementProvider` owns slot registration and launcher focus state. `WorkspacePage` mounts exactly one `WorkspaceAdvisorHost` outside the compact, Terminal, and IDE shell branches. That host owns the one `PluginHost`/iframe; `AdvisorPanelSlot` elements in the shell trees register viewport geometry and activation callbacks. Visual mode changes select a slot and project the host over it; they do not reparent or recreate the iframe.

The three placements are:

- **IDE right-side tool:** mode `ide`, default z-index 15.
- **Terminal floating tool:** mode `terminal`, default z-index 25. The slot reserves `pb-8 pr-8` for the floating panel's resize grip; the tool uses the existing floating-panel layout and chrome.
- **Compact Workspace surface:** mode `compact`, default z-index 35, rendered as a full-height overlay with Back/close to the previous surface.

`measureAdvisorSlotGeometry` returns no geometry when the slot is absent, hidden, disconnected, or has zero dimensions. Otherwise, it rounds the slot's viewport rectangle and resolves an explicit z-index before the mode default. The host applies that rectangle to a fixed-position container.

Measurement starts immediately on slot activation. A `ResizeObserver`, window resize, passive capture scroll, app-zoom change, and `workspace:layout-change` schedule a coalesced animation-frame measurement. Terminal floating-panel drag/resize dispatches the custom layout event so translation-only changes also reposition the fixed host. Slot removal cancels pending work, disconnects the observer, and removes each listener; there is no idle polling loop.

When there is no active visible slot, the host remains mounted but becomes offscreen, hidden, pointer-disabled, `inert`, and `aria-hidden`. The frame therefore stays out of focus traversal while its selected-project authority remains valid. If hiding removes focus from inside the host, focus returns to a connected launcher or the old active element is blurred. Escape closes through the Workspace action; the negotiated `activate` intent activates the current slot. Placement never changes editor, project, or terminal selection. Project/profile/owner/authority changes still follow the existing revoke/replacement rules.

### Phase 05 verification and limits

Cycle 2 review records 106 passing unit tests across 10 files, 12 passing Chromium browser tests across four files, and `tsc --noEmit` with zero errors; it approves the phase at 9.8/10. The two Cycle 1 warnings were resolved. The review reports no critical, high, or medium findings and retains an optional low-priority suggestion for IDE-tab launcher focus wiring.

The G5 Chromium fixture asserts one iframe DOM element across IDE → Terminal → compact → IDE and hide/reopen, and asserts hidden/inert host state. It mocks `PluginHost`; it does not read a production `FrameSession` identifier, viewer snapshot, authorized context, or history-refresh count. The production stable mount and `use-plugin-host.ts` visibility/unmount paths support session continuity, but internal session/snapshot preservation is not directly measured by that fixture.

The three checkpoint invariants and their source/test coverage boundaries are mapped in the [Phase 05 evidence handoff](../plans/reports/docs-manager-260929-2357-phase-05-persistent-workspace-placement.md). In particular, `WorkspaceAdvisorHost.test.tsx` supplies `project={null}` to a mocked `PluginHost`; it does not assert zero API calls through `use-plugin-host.ts`. The slot tests check unregister-on-unmount; host tests check geometry, inert state, layout-event remeasurement, Escape, and focus, while effect cleanup code removes observers/listeners.

Phase 05's review approval is not user approval, paired end-to-end rollout, or production deployment. The supplied review/checkpoint do not identify an immutable DamHopper commit SHA.
