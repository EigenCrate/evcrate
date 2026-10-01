# DamHopper Advisor Plugin — Framed Node Worker

**Status:** Phase E02 implementation complete (2026-09-21; review 9.5/10). Joint G1 owner-runner qualification remains downstream.
**Authority:** E02 `plugin/` worker closure and pinned D00 Worker SDK. Root-history behavior is implemented and qualified by All-project advisor history Phases 03–05; that milestone does not imply the separate plugin Replacement G1/G2/G4 gates are complete.
**Related:** [Phase E02 plan](../plans/260920-1603-dam-hopper-advisor-plugin/phase-02-plugin-worker.md), [system architecture](./system-architecture.md#9-damhopper-advisor-plugin-replacement), [codebase summary](./codebase-summary.md), [cross-project contract and qualification evidence](./all-project-advisor-history.md).

## Purpose and boundary

E02 wraps the E01 read provider in a D00 SDK worker executable under the cross-platform trusted-files policy. The runner owns process lifecycle, durable installation/source/grant authority, and current actor/session authorization. The worker owns only protocol admission, ephemeral context/request state, capability dispatch, result validation, and safe process events.

The worker:

- reads framed requests from private stdin and writes framed responses to stdout;
- opens no socket, starts no listener, spawns no model/child process, and runs no shell;
- does not mutate history, policy, evaluations, HOME, or source files;
- keeps stdout protocol-only; sends bounded sanitized operational events to stderr;
- does not replay work after reconnect, restart, context revocation, or cancellation;
- is an internal backend-only candidate, not the E04 product package or a release asset.

```text
runner private pipe
  -> D00 SDK FrameDecoder / JSON-RPC validation
  -> runner.hello version gate
  -> ephemeral WorkerContextTable
  -> WorkerRequestTable admission/cancellation/deadlines
  -> WorkerDispatcher capability + revision checks
  -> EVCrateAdvisorProvider (E01)
  -> E00 params/result validators
  -> one terminal response frame
stderr -> bounded sanitized events
```

## Package and manifest

`plugin/package.json` is an independent private CommonJS package (`0.1.0`) with Node `>=22.19.0`. Its only dependency is the exact local companion archive `@dam-hopper/plugin-sdk` `file:./vendor/dam-hopper-plugin-sdk-0.1.0.tgz`; `plugin/package-lock.json` records the local resolution and integrity. There are no plugin lifecycle scripts. The root package owns candidate build/check and focused test commands.

`plugin/manifest.json` declares:

- manifest `1`, plugin ID `evcrate.advisor`, version `0.1.0`, publisher `evcrate`;
- host range `>=0.4.0`;
- runner protocol, worker SDK, UI bridge, manifest, and data API contract pins;
- backend entry `backend/worker.cjs`, runtime `node`, range `>=22.19.0`;
- exactly eight implemented capabilities (listed below);
- the E02 backend baseline inventory had 63 closure files with size, SHA-256, and
  mode; the current E03 candidate adds `ui/index.html` as inventory entry 64.

The E02 implementation was intentionally backend-only before E03. Phase E03 now
adds the embedded UI entrypoint/navigation and a provider-neutral client; this guide
continues to describe the worker/backend boundary, not the UI package.

## JSON-RPC streaming framing

The D00 SDK owns generic framing; EVCrate does not fork wire logic. Each stream frame is:

```text
4-byte unsigned big-endian payload length
UTF-8 JSON-RPC 2.0 payload
```

The SDK checks the 16 MiB payload ceiling from the header before allocating the body, decodes strict UTF-8, and validates one JSON-RPC message. Control payloads are limited to 64 KiB by the shared contract. The worker accepts string IDs only, rejects batches, malformed JSON-RPC, unknown/extra fields, invalid UTF-8, and oversized headers. Domain payload limits remain enforced by E00 validators.

`FrameDecoder` handles both fragmented frames (header/body split across chunks) and coalesced frames (multiple messages in one chunk). EOF with a partial frame is logged as `EOF_MID_FRAME` and stops the worker; it does not hang or fabricate a response. Decoder or message-validation failures reset the decoder and emit one error frame with a safe code and null request ID. A valid notification dispatches without a response. A request receives at most one terminal result/error frame.

`createWorkerServer` accepts injectable streams for tests, creates one decoder, and serializes outgoing objects with `JSON.stringify` then SDK `encodeFrame`. All stdout writes go through this path. No diagnostics, stack, raw exception, or debug text may be written to stdout.

## Handshake and dispatch

Before `runner.hello`, every method is rejected with `INCOMPATIBLE`. `runner.hello` requires a client protocol version and compares the major version with the SDK runner protocol. A successful response reports runner version, negotiated protocol, worker SDK version, manifest version, E00 data API version, and supported capabilities. A repeated hello is a reconnect boundary: active requests are cancelled and all prior contexts revoked before the new handshake is accepted.

The dispatcher recognizes only these methods:

| Method | Behavior |
|---|---|
| `runner.hello` | Protocol-major negotiation and capability/version response. |
| `context.open` | Validate target/context grant metadata; create ephemeral provider-backed context. |
| `context.close` | Cancel that context's requests and revoke/remove it. |
| `plugin.invoke` | Check current context, operation, revisions, admission, then delegate to E01. |
| `request.cancel` | Return independent `accepted`, `alreadySettled`, or `unknown` acknowledgement. |
| `worker.health` | Return healthy status, versions, counts, and uptime. |
| `worker.shutdown` | Cancel all requests, revoke all contexts, return `shutting_down`. |

Advertised and accepted domain capabilities exactly:

- `history.refresh`, `history.summary`, `history.page`, `history.detail`;
- `policy.readCurrent`;
- `evaluations.list`, `evaluations.read`, `evaluations.compare`.

Export, prune, policy write, model execution, arbitrary file access, exec, source discovery, and unknown methods are not capabilities. The dispatcher formats success as `{ jsonrpc: "2.0", id, result }` and errors as JSON-RPC `error` objects carrying only safe code/message/details.

## Context lifecycle

`WorkerContextTable` is ephemeral. Defaults come from `RESOURCE_BUDGETS`: at most 16 contexts per worker, 4 active/queued operations per context, and a 300,000 ms idle TTL (SDK/domain budgets remain the contract authority). `context.open` validates and stores:

- opaque context ID (provided bounded ID or `ctx-<UUID>`);
- actor subject and installation ID;
- normalized configured project target and E01 history identity;
- optional worktree path;
- API connection epoch;
- activation generation, binding revision, grant revision;
- allowed operation list and `allowCurrentAccountPolicy`;
- timestamps/idle deadline and provider instance.

The target is checked by E01 binding rules before provider creation. The allowed operation list is copied and frozen. `policy.readCurrent` additionally requires the explicit account-policy flag. An operation slot is acquired before request admission and released in a `finally` path, so context capacity includes work waiting in the worker queue.
When `scope.kind` is `'history-root'`, `WorkerContextTable` resolves the history root (`findHistoryRoot`), performs non-symlink ancestor canonicalization (`verifyTargetDirectory`), and strictly verifies that `verifiedTarget.historyIdentity` matches `scope.rootIdentity` (lowercase 64-char SHA-256). Mismatches fail closed with `SOURCE_NOT_CONFIGURED`, and missing paths throw `SOURCE_MISSING`. See the [All-Project Advisor History Contract](./all-project-advisor-history.md#root-identity-sha-256-generation-and-host-configuration-guide) for identity generation and host provisioning.


Each invoke gets the current context and operation authorization. The dispatcher validates supplied activation, binding, and grant revisions against the context; a mismatch cancels context requests, revokes the context, and returns `CONTEXT_REVOKED`. E01 rechecks target directory invariants on every provider invoke and validates domain parameters/results. Host API/runner authorization remains required on every invoke; a context-open result is not a durable grant.

Explicit close, idle expiry, revision mismatch, runner reconnect, worker shutdown, signal, stream failure, uncaught exception, or unhandled rejection cancels work and removes/revokes context state. No request is replayed across reconnect or process restart. The runner, not this table, remains durable source/grant authority.

## Request lifecycle and admission

`WorkerRequestTable` maps each request ID to one `AbortController`, SDK cancellation token, deadline timer, context ID, operation, and settlement state.

Admission rules:

- 16 active worker operations;
- queue capacity 32;
- one active `history.refresh` scan per worker;
- one active evaluation parse for `evaluations.read`/`evaluations.compare`;
- queued entries retain closures/metadata, not decoded frame bodies;
- overflow returns retryable `OVERLOADED`.

`startRequest` increments only the counters represented by the request and passes `AbortSignal` plus effective deadline to the provider. `entry.started` distinguishes running from queued/rejected entries; `settleRequest` clears timers, unregisters cancellation, decrements only counters that were incremented, resolves/rejects once, and drains every newly runnable queue entry. This preserves the one-scan and one-evaluation-parse invariants during cancellation and overload races.

`request.cancel` is independent from the original invocation. The acknowledgement is:

- `accepted`: cancellation was applied to active/queued work;
- `alreadySettled`: the request is no longer cancellable;
- `unknown`: request ID is not known in this connection/context.

The original request still emits exactly one terminal result, `CANCELLED`, `DEADLINE_EXCEEDED`, provider error, or other safe failure. A later request ID reuse cannot cancel an earlier settled generation. Deadline expiry aborts cooperatively; no automatic retry/replay. Runner-level deadline/crash recovery remains responsible for failing/restarting the whole worker when cooperative work does not settle.

## E01 provider and E00 validation

`WorkerContextTable` creates `EVCrateAdvisorProvider` with a normalized target, history identity, binding revision, and allowed operations. `dispatcher.handleInvoke` passes operation/payload plus signal/deadline to `provider.invoke`.

`provider.cjs` gates the eight E00 methods, checks context permissions, rechecks the target, validates method parameters before dispatch, calls the history/policy/evaluation provider, then validates the result. `plugin/backend/data-api.cjs` is a package-local bundled CommonJS copy of the v1/v2 validators/constants and removes the candidate's runtime dependence on root `dist/`; the development fallback exists only for source-tree loading. The Phase 01 v2 validator/schema freeze does not itself implement the root-history provider; that work remains downstream.

Provider status unions (for example fresh/stale/unavailable or changed/missing detail) are domain results, not thrown worker failures. Context, binding, permission, source, and protocol failures cross the worker boundary only through mapped D00 errors.

## Error mapping and observability

`error-mapping.cjs` maps internal/provider codes to the D00 `PluginErrorCode` set: authorization/forbidden, incompatible, runner/runtime unavailable, source not configured/missing/permission denied, invalid input, overloaded, deadline, cancelled, context revoked, snapshot expired, detail changed/missing, and worker failed. Unknown exceptions use `WORKER_FAILED`.

Before creating a public error, the mapper:

- redacts POSIX/Windows paths and long hex/token-like values from messages;
- retains only an allowlist of safe detail keys (`operation`, record/evaluation refs, revisions, limits, retryability, safe code, counts);
- preserves retryability only when explicitly safe or overloaded;
- never exposes HOME, actor credentials, source bytes, raw stderr, or stack traces.

`formatErrorResponse` places safe `code`, `message`, filtered details, and retryable metadata in the JSON-RPC error. `logOperationalEvent` writes one JSON line to stderr, capped at 1,024 characters, with timestamp, truncated correlation/request/context IDs, operation, safe code, duration, and counts. Logging failure is swallowed; it cannot corrupt stdout or crash the worker.

Signals stop the server after cancellation/revocation. Stream errors, uncaught exceptions, and unhandled rejections log a safe event, cancel/revoke pending state, and exit when executed as the worker entrypoint. The executable is trusted process code running under the host-managed execution context (advisor filesystem UID gates are removed under the cross-platform trusted-files policy), not a malicious-code sandbox.

## Deterministic G1 candidate builder

`node scripts/build-advisor-plugin-candidate.mjs` builds `artifacts/candidate/evcrate-advisor-plugin-0.1.0-candidate.tar.gz` and rewrites `plugin/manifest.json` from the current closure. `--out-dir <dir>` changes the artifact directory; `--check` performs manifest/inventory consistency and candidate existence checks without rebuilding.

Collection order and archive behavior:

1. Include plugin `package.json`/lockfile, E00 contract manifest/schema, every backend `.cjs`, and the installed SDK package closure.
2. Exclude nested SDK `.tgz`, source maps, and test files from the installed closure.
3. Hash every inventory file with SHA-256; record path, byte size, digest, and mode (`0755` only for `backend/worker.cjs`, `0644` otherwise).
4. Validate the generated manifest with the installed SDK.
5. Add root `manifest.json` to the archive (not to its inventory).
6. Write a deterministic USTAR tar stream, PAX path records when needed, normalized modes, gzip level 9, and gzip `mtime: 0`; no `package/` prefix.

The E02 reviewed artifact record is historical backend-only evidence. The current
E03 candidate may also contain `ui/index.html` and navigation; that extension does
not change the worker's backend capabilities or authorize G1/G2, E04 publication,
or standalone viewer retirement.

## Verification and handoff

Review evidence for E02 implementation closure:

```bash
npm run test:advisor-plugin-worker
node --test tests/plugin/*.test.mjs
npm run check:advisor-plugin-candidate
npm run build:advisor-plugin-candidate
```

Cycle 2 review records 22/22 focused worker tests, 31/31 all-plugin tests, candidate check PASS, deterministic candidate build PASS, and 63 inventory files (dated historical evidence; the Worker SDK prerequisite currently exists only as a `plugin/vendor` reference blocked by configured ignore, so the worker test suite is not claimed as passing in this workspace). The historical worker test files cover handshake/order, context limits and revocation, reconnect teardown, revision mismatch, fragmented/coalesced streams, oversized and invalid UTF-8 frames, JSON-RPC batch/numeric-ID rejection, EOF mid-frame, cancellation races, deadlines, queued cancellation, manifest checksums, and archive structure.

These are repository/fixture gates, not G1 proof. G1 still needs D01–D03 to install the exact candidate under the real host runner and prove authenticated refresh/summary, host-level wrong-owner denial, logout/grant-revision revocation, cancellation settlement, worker crash recovery, and malformed/incompatible input fail-closed behavior (advisor filesystem UID restrictions inside the provider are removed under the cross-platform trusted-files policy).

## Unresolved questions

- D00/G0 must confirm the approved SDK candidate package location, released version, digest, and compatibility range; the local `file:` SDK pin is only the current internal candidate.
- D01–D03 must record the real owner-worker G1 evidence and runner recovery behavior before this worker is treated as integrated.

## Related source map

- `plugin/backend/worker.cjs` — entrypoint, SDK frame loop, stream/process lifecycle.
- `plugin/backend/context-table.cjs` — bounded context state and revocation.
- `plugin/backend/request-table.cjs` — admission, cancellation, deadlines, settlement.
- `plugin/backend/dispatcher.cjs` — handshake, capabilities, methods, revisions.
- `plugin/backend/error-mapping.cjs` — safe errors and stderr events.
- `plugin/backend/data-api.cjs` — bundled E00 validators.
- `plugin/manifest.json` — candidate contract and inventory.
- `scripts/build-advisor-plugin-candidate.mjs` — deterministic archive/inventory builder.
