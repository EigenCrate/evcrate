# Advisor Supervision Migration

## Who this affects

This release changes checkpoint counsel for `/bootstrap`, `/code`, `/cook`, and
`/fix` variants that support advisor supervision. Replace a final `@advisor`
with a final `--advice`:

```text
/code add caching @advisor   # ordinary task text
/code add caching --advice   # explicit checkpoint counsel
```

`@advisor` is ordinary unchanged input. It is not an alias and has no grace
window. `--advice` is case-sensitive, whitespace-delimited, standalone, final,
and may have trailing whitespace. Duplicate flags reject. Quoted, embedded,
suffixed, differently cased, and non-final forms remain ordinary task text.

| Command | Checkpoint counsel | Ordinary task text |
|---|---|---|
| `/bootstrap` | `/bootstrap create a CLI --advice` | `/bootstrap create @advisor notes` |
| `/code` | `/code add caching --advice` | `/code read @advisor.md` |
| `/cook` | `/cook add caching --advice` | `/cook annotate @advisor input` |
| `/fix` | `/fix repair cache --advice` | `/fix path/@advisor/config` |

Fallback command handoffs preserve `WORK_ARGUMENTS`: explicit mode forwards one
final `--advice`; default mode forwards no mode token. No handoff recreates an
`@advisor` mode.

## One advisory surface for checkpoints

`--advice` reaches a named `review:<workflow-step>`,
`stuck:<blocker-signature>`, or `decision:<workflow-step>` checkpoint after its
prerequisite evidence exists. The workflow sends one direct request to:

```text
~/.evcrate/bin/evcrate-advisor
```

The executable accepts the checkpoint object itself. It does not accept a host,
route override, executable, argv, credential, debug, or fallback field. The
request has exactly these ten keys:

```json
{
  "protocol": "evcrate-advisor-checkpoint",
  "version": 1,
  "checkpoint": "review:implementation-step",
  "question": "What is the smallest safe next change?",
  "kind": "review",
  "task_or_phase": "Implementation",
  "evidence": {"terminal": "Bounded review evidence.", "files": []},
  "changed_paths": [],
  "prior_counsel": [],
  "owner_disposition": "Proceed after validation."
}
```

The request is limited to 32 KiB; question, task/phase, and terminal evidence
are limited to 4 KiB, 8 KiB, and 16 KiB. There are at most four evidence files
and sixteen changed paths. Paths are safe normalized relative POSIX paths.
Credentials, control characters, duplicate keys, traversal, metadata paths, and
invalid UTF-8 reject before a model process starts. Evidence file names are
metadata only and are not read by the controller.

Only an outer `ADVICE_READY` result completes the checkpoint gate. Any nonzero
exit, malformed output, timeout, cancellation, unavailable executable, or
`FAILED` envelope leaves the checkpoint incomplete. The controller makes one
backend selection and one final model-process attempt; it never retries, changes
model or effort, switches backend, invokes a local fallback, or enters a native
callback branch.

## Global policy and backend status

The controller reads the required user-owned policy at
`$HOME/.evcrate/advisor-routing.json`:

```json
{
  "version": 1,
  "advisor": {
    "backend": "codex",
    "model": "gpt-5.6-sol",
    "effort": "high",
    "timeout_ms": 900000
  }
}
```

The policy has exactly the two top-level keys `version` and `advisor`, and the
advisor object has exactly `backend`, `model`, `effort`, and `timeout_ms`.
`timeout_ms` is inclusive 60000..900000. A missing file returns
`ROUTE_POLICY_REQUIRED`. A version-1 top-level `hosts` object returns
`ROUTE_SCHEMA_MIGRATION_REQUIRED` with the action to replace it with one
`advisor` object. Malformed, oversized, duplicate-key, credential-bearing,
unsafe, and unknown-field policies fail closed; no default or partial merge is
used.

| Backend | Status | Behavior |
|---|---|---|
| `claude` | Enabled | Qualified fixed safe-mode JSON adapter. |
| `codex` | Enabled | Qualified fixed ephemeral read-only JSONL adapter. |
| `pi` | Enabled | Qualified fixed no-session/no-tools JSONL adapter. |
| `omp` | Enabled | Qualified fixed no-session/no-tools/no-LSP JSONL adapter with redacted provider usage auth. |
| `antigravity` | Disabled candidate | `CLI_CAPABILITY_UNSUPPORTED` before final launch. |
| `gemini` | Unsupported | `ADAPTER_UNSUPPORTED`; not a registry member. |

Installed CLIs own authentication. EVCrate stores no provider credentials. A
CLI diagnostic version is recorded in the receipt, but version equality alone is
not qualification; feature, authentication, model/effort, isolation, session,
and output probes must pass. Real qualification is Linux-only and must be
repeated after CLI upgrades.

## Controller result

The controller emits one frozen JSON envelope with protocol
`evcrate-advisor-controller`, version `1`, a controller-generated UUID
`correlation_id`, a status, and a receipt:

```json
{
  "protocol": "evcrate-advisor-controller",
  "version": 1,
  "correlation_id": "controller-generated-uuid",
  "status": "ADVICE_READY",
  "receipt": {
    "backend": "codex",
    "model": "gpt-5.6-sol",
    "effort": "high",
    "controller_version": 1,
    "adapter_version": "diagnostic-cli-version",
    "elapsed_ms": 1234
  },
  "result": {"protocol": "evcrate-advisor-result", "version": 1}
}
```

Success adds the normalized `evcrate-advisor-result/v1` result. Failure uses
`FAILED` and adds only sanitized `error` fields: `code`, `category`, `action`,
and `message`. Unknown receipt fields are `null` when the failure occurs before
selection. Normal stdout has one JSON line and stderr is empty.

## `/advise` remains separate

`/advise <prompt-or-url>` is an inline, interview-first main-session feature. It
is not the checkpoint controller and does not select a backend through the
checkpoint policy. Claude's exact final `--agent` relay behavior, where present,
is separately bounded and fails closed; it is not an alternate execution path
for `--advice`.

## Distribution and troubleshooting

The controller is authored only at `.evcrate/source/.evcrate/bin`, built once,
and published atomically to `$HOME/.evcrate/bin`. Build manifests use schema 2
and `controller_hashes`; harness-local controller copies and per-target
controller authorization are not part of the release.

Edit canonical sources or declared overlays, then regenerate and verify:

```bash
python3 distribute.py --build
python3 distribute.py --build
python3 distribute.py --check
node --test tests/advisor-controller/*.test.cjs
```

Use a disposable HOME for publication:

```bash
EVCRATE_HOME="$TEMP_HOME" python3 distribute.py --publish --dry-run --json
```

The publisher preserves `$HOME/.evcrate/advisor-routing.json`, rejects unsafe
ancestors, and recovers an interrupted complete-bin promotion with
`python3 distribute.py --recover`. Never hand-edit generated target trees or
add a second launcher/fallback.
