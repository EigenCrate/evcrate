# Browser History Scanner

**Status:** Phase 05 complete (2026-09-18)  
**Scope:** Static viewer browser I/O; read-only history and policy inspection  
**Authority:** `viewer/src/io/` plus the shared protocol and metrics validators

The viewer reads explicitly selected local handles through the browser File System
Access API. It does not infer `$HOME`, access a parent directory, upload/archive
files, run a watcher, persist handles, or mutate history/policy. Browser validation
proves record structure only; it cannot attest Linux owner, mode, symlink, hard-link,
or descriptor guarantees.

## Data flow

```text
user gesture
  -> showDirectoryPicker({ id: "evcrate-history", mode: "read" })
  -> permission check
  -> sorted bounded traversal (project/task/consultation)
  -> bounded record reads (four concurrent workers)
  -> strict protocol validation + Web Crypto checkpoint digest
  -> normalized browser records
  -> shared history metrics kernel
  -> generation commit: replace or retain-stale
```

The scanner returns a result object; it never writes React state. Handle references
remain outside serializable UI state. Refresh is explicit, and reload forgets both
handles and snapshots.

## Source map

| Module | Responsibility |
|---|---|
| `viewer/src/io/history-reader.ts` | Picker, read permission, generation/cancellation orchestration, metrics calculation, atomic commit decision. |
| `viewer/src/io/history-traversal.ts` | Three-level enumeration, name validation, code-point sorting, candidate file discovery. |
| `viewer/src/io/history-record-reader.ts` | Bounded `File` reads, fatal UTF-8/JSON parsing, shared v1 validators, digest and identity checks, normalization, bounded workers. |
| `viewer/src/io/history-scan-budget.ts` | Immutable policy constants, counters, retained diagnostics, suppression accounting, and limit state. |
| `viewer/src/io/browser-digest.ts` | Web Crypto SHA-256 adapter for text/bytes and order-preserving checkpoint digests. |
| `viewer/src/io/policy-reader.ts` | Explicit single-file policy picker, read permission, bounded parse, and v2/legacy inspection. |
| `viewer/src/io/file-system-access.d.ts` | Minimal local declarations for picker, file, directory, permission, and handle APIs. |
| `viewer/tsconfig.json` | Strict NodeNext/no-emit viewer type-check using ES2022, DOM, and DOM.Iterable libraries. |

## Selection and traversal boundary

`selectHistoryDirectory` calls `showDirectoryPicker` only when available and only
with the fixed picker ID and `mode: "read"`. A cancelled picker returns `null`.
`verifyDirectoryPermission` queries read permission and optionally requests it;
denial is a scan failure, never an upload or fallback path.

The selected directory is classified by its lowercase name:

- A 64-lowercase-hex name is treated as one project root.
- Any other selected name is treated as a history root; only direct 64-hex
  project directories are candidates.

Traversal inspects exactly three levels below a project: UUID task directory,
UUID consultation directory, then direct `execution.json` and optional
`outcome.json`. Names and entries are sorted by code point before processing.
Unexpected names, files, nested directories, unreadable levels, and missing
`execution.json` produce sanitized diagnostics. No arbitrary descendant is read.

## Bounded scan policy

| Budget | Limit | Enforcement |
|---|---:|---|
| Execution file | 128 KiB | Pre-check `File.size` and post-read byte length. |
| Outcome file | 64 KiB | Pre-check and post-read byte length. |
| Policy file | 16 KiB | Pre-check and post-read byte length. |
| Root entries | 256 | Stop the selected-root enumeration. |
| Tasks/project | 256 | Stop that project traversal. |
| Consultations/task | 256 | Stop that task traversal. |
| Total consultations | 65,536 | Stop candidate discovery. |
| Enumerated entries | 200,000 | Stop all further enumeration. |
| Direct file bytes | 256 MiB | Count discovered sizes before reads. |
| Concurrent reads | 4 | Fixed worker queue. |
| Diagnostics retained | 4,096 | Sort retained diagnostics; count the rest as suppressed. |
| Yield cadence | 64 records | Yield with a zero-delay task between batches. |

A limit sets `limit_hit` and produces <code>COUNT_LIMIT</code> or
<code>SELECTION_BYTE_LIMIT</code> diagnostic. Limit or traversal failure makes the scan
`incomplete`; it must not present a partial sample as a fresh replacement.

## Record validation and normalization

Each candidate read is guarded by `AbortSignal` and handle/file failures become
<code>MISSING_DURING_SCAN</code> or <code>CONCURRENT_MODIFICATION</code> diagnostics. The reader uses
fatal UTF-8 decoding, strict JSON parsing, schema version `1`, and the shared
`validateHistoryExecutionV1` / `validateHistoryOutcomeV1` validators.

Execution acceptance additionally requires:

1. `project_id`, `task_run_id`, and `consultation_id` match directory identities.
2. The checkpoint task ID matches the execution task ID.
3. `computeBrowserCheckpointDigest` matches the stored checkpoint digest.
4. The validated record can pass `normalizeHistoryRecord` with source
   `{ kind: "browser", relative_path }`.

An invalid execution is excluded. A missing outcome remains an accepted execution
with `outcome_state: "missing"`; an unreadable, oversized, unsupported, malformed,
or identity-mismatched outcome remains an accepted execution with
`outcome_state: "invalid"`. Valid outcomes preserve their result. The shared
metrics kernel lowercases identities and resolves duplicate identities: identical
copies collapse, conflicting copies are excluded with <code>DUPLICATE_IDENTITY</code>.

Diagnostics have the fixed code/path/identity/byte/schema-version shape. Raw
exceptions, input text, absolute paths, and browser implementation details do not
cross the result boundary.

## Generational commit state machine

`HistoryReader.scan` first cancels the active controller, increments a monotonic
generation, and captures a new cancellation controller. Every permission,
traversal, read, and yield checks cancellation or whether its generation is still current.

| Condition | Commit | Visible snapshot |
|---|---|---|
| Complete, no diagnostics | `replace` | Fresh, `stale: false` snapshot. |
| Complete with recoverable diagnostics | `replace` | Fresh snapshot with scan diagnostics and missingness. |
| Limit, permission, traversal, cancellation, or stale generation | `retain-stale` | Prior snapshot retained with `stale: true`; absent if none exists. |

A replacement snapshot carries generation, selected root handle, metric scope,
normalized records, metrics result, scan time, and stale state. An older
completion cannot overwrite a newer generation. Non-atomic enumeration/read
races are diagnostics, not deletion claims.

## Policy inspection

`selectAndReadPolicyFile` uses one `showOpenFilePicker` selection restricted to
JSON. `readPolicyFileHandle` requests read permission, enforces the 16 KiB limit,
uses fatal UTF-8 and JSON parsing, then delegates schema decisions to shared
`inspectPolicy`:

- v2 returns <code>POLICY_READY</code> with validated primary/backup routes, wait mode, and
  retention/quota values;
- legacy v1 returns <code>POLICY_MIGRATION_REQUIRED</code> with the validated legacy view;
- unsupported version, invalid schema, denial, read failure, cancellation, and
  oversized input return explicit status values.

The reader never writes, migrates, relabels, or silently substitutes a policy.

## Verification and handoff

Focused browser coverage lives in `tests/viewer/` and
`tests/fixtures/advisor-history-browser/`: fake handles cover project/root
selection, sorting, unexpected entries, unreadable subtrees, limits, cancellation,
concurrent modification, identity/digest failures, policy states, and generation
races. Equivalent normalized browser and controller records use the same Phase 02
metrics kernel. Phase 06 consumes this reader boundary for separate evaluation
inputs; Phase 07 established the shared React state/views. Phase E03 adds
provider-neutral standalone/DamHopper adapters and embedded navigation without
changing this browser I/O boundary.

## Related references

- [System architecture](./system-architecture.md#phase-05-browser-history-traversal-and-scanner)
- [Codebase summary](./codebase-summary.md#browser-history-scanner-phase-05)
- [Phase 05 plan](../plans/260917-2308-advisor-visual-metrics/phase-05-browser-history-traversal-and-scanner.md)
- [Phase 05 changelog entry](./project-changelog.md)
