<!-- EVCRATE_MENTORING_CAPABILITIES_START -->
<!-- EVCRATE_CAPABILITY: mentoring/supported/v2 -->
<!-- EVCRATE_CAPABILITY: write-checks/vscode/advisory-only/v1 -->
<!-- EVCRATE_MENTORING_CAPABILITIES_END -->

# Advisor Mentoring Contract

Use this contract whenever an implementation workflow executes under advice mode
or reaches a named checkpoint. It defines raw argument parsing, bounded evidence,
mandatory task-state lifecycle, canonical controller invocation, and the owner
disposition gate.

## Argument mode

1. Inspect raw command arguments before interpreting plan, phase, task, or
   positional input.
2. A standalone token is exactly `--advice` delimited by whitespace. Count all
   standalone tokens first. Two or more tokens are a deterministic input error;
   stop normal work.
3. With exactly one token, explicit advice mode is active only when the token is
   final after trailing whitespace. A non-final token is ordinary input.
4. In explicit mode remove only the final token, its separator, and trailing
   whitespace. Preserve every other byte as `WORK_ARGUMENTS`.
5. With no active mode, `WORK_ARGUMENTS` is the complete raw input unchanged.
   `--advice` alone produces empty work input and follows normal empty-input
   handling.
6. The raw wrapper is local parsing only. Downstream prompts receive
   `WORK_ARGUMENTS`; never forward the wrapper itself.

```text
RAW = the unmodified argument string
TOKENS = standalone `--advice` matches with whitespace boundaries
if count(TOKENS) > 1: reject and stop
if count(TOKENS) == 1 and the match is final after trailing-whitespace removal:
    WORK_ARGUMENTS = RAW prefix before the match, with only its separator removed
    ADVICE_MODE = explicit
else:
    WORK_ARGUMENTS = RAW
    ADVICE_MODE = default
```

Do not normalize, re-tokenize, trim internal whitespace, or rewrite any other
prefix or suffix bytes. The exact final `@advisor` token is ordinary work input.

## Named checkpoints

Use only these canonical checkpoint IDs:

- `direction:<workflow-step>`: orientation and direction check before
  consequential writes or major architectural branch.
- `review:<workflow-step>`: after terminal reviewer evidence and before findings
  are displayed, fixes are made, approval is requested, or a final decision
  uses that evidence.
- `stuck:<blocker-signature>`: on the second consecutive matching terminal
  blocker with no relevant gate pass or workflow-step advance, before attempt
  three.
- `decision:<workflow-step>`: immediately before an irreversible,
  security-sensitive, or go/no-go decision not already covered by review.
- `reconcile:<workflow-step>`: when resolving technical or scope
  contradictions, or addressing an `need-evidence` disposition.

Routine planning, minor edits, and preference choices do not create a
checkpoint. The caller supplies one precise question, terminal evidence,
changed paths, relevant prior counsel, and the owner's earlier disposition.
Include at most four repository-relative evidence file objects and sixteen changed
paths. In V2, `evidence.files` is an array of 0-4 objects each having exactly
`path`, `excerpt`, and `digest`. `path` is a safe repository-relative POSIX path.
`excerpt` is non-empty text bounded within the aggregate 16 KiB evidence text budget.
`digest` is the lowercase 64-character SHA-256 hex digest of the complete current
file bytes (never the excerpt). `proposal.intended_changed_paths` is an array of
relative path strings; bare strings in `evidence.files` are invalid. Exclude secrets,
credentials, policy contents, raw stderr, stacks, traces, broad dumps, and unrelated logs.
## Canonical checkpoint routing

Named checkpoints use the canonical `evcrate-advisor-checkpoint/v2` dispatcher block in
`.evcrate-vscode/evcrate/workflows/advisor-mentoring.md`; this contract supplies bounded evidence
and does not duplicate route or adapter selection.

## Authoritative host-aware controller invocation

The canonical caller workflow dispatches to the central controller according to the host platform and shell environment. All maintained callers invoke Node with the absolute script path; never execute an extensionless file directly without `node`, assume direct POSIX execution fallback, or use `.cmd` shims.

### 1. Platform dispatch rules

1. **Linux / POSIX shell**:
   - **HOME resolution**: Validate `$HOME` before constructing the script path; an invalid or missing HOME is an error. Never fall back to another profile or project search.
   - **Controller path**: Absolute quoted script path: `"$HOME/.evcrate/bin/evcrate-advisor"`.
   - **Invocation**: `node "$HOME/.evcrate/bin/evcrate-advisor" ...` with trailing arguments (`state <op>`, `history <op>`, or empty for checkpoint inference).
   - Supply JSON payload via standard input heredoc (`<<'JSON'`) or stdin pipe.
2. **Native Windows PowerShell (Windows PowerShell 5.1 and PowerShell 7+)**:
   - **HOME resolution**: Use explicit `$env:HOME` when set; an invalid explicit HOME is an error, not a reason to fall back. Only when HOME is unset use `$env:USERPROFILE` if non-empty, otherwise `[Environment]::GetFolderPath('UserProfile')`. This matches the controller's Windows `os.homedir()` fallback even when USERPROFILE is overridden. Never search project roots.
   - **Controller path**: Build the absolute controller script path under that home and invoke it as a quoted argument to `node`, not as an extensionless executable.
   - **Encoding safety**: PowerShell 5.1's native-command pipeline encoding is not UTF-8 by default. Save `$OutputEncoding`, set it to BOM-free UTF-8 for JSON stdin, and restore it in `finally`.
   - **Stdin streaming**: Pipe the exact JSON document (`$jsonPayload | & node "$controller" ...`); never interpolate JSON into command arguments or `-Command`.

3. **Programmatic Node callers on all hosts (Node.js argv-array)**:
   - Invoke `process.execPath` with `[controller, ...args]` and `shell: false`. Do not emit Bash syntax merely because a harness tool is named `bash`. A Bun-hosted tool must resolve actual supported Node explicitly; its own `process.execPath` is not Node by definition.
   - Select explicit HOME when set, otherwise `os.homedir()`; an invalid explicit HOME fails controller validation.
   - Use `['state', op]`, `['history', op]`, or `[]` (empty inference argv is `[controller]`, not omitting the script) and write the exact JSON as UTF-8 stdin before closing it. Bound output and observe exit status and the terminal envelope.
### 2. Host invocation syntax reference

| Operation | POSIX shell (Bash) | Windows PowerShell (5.1 / 7+) | Programmatic Node (`shell: false`) |
| :--- | :--- | :--- | :--- |
| **Checkpoint inference** | `node "$controller" <<'JSON'` | `$jsonPayload \| & node "$controller"` | `spawn(process.execPath, [controller], { shell: false })` |
| **State subcommand** | `node "$controller" state <op> <<'JSON'` | `$jsonPayload \| & node "$controller" state <op>` | `spawn(process.execPath, [controller, 'state', op], { shell: false })` |
| **History subcommand** | `node "$controller" history <op> <<'JSON'` | `$jsonPayload \| & node "$controller" history <op>` | `spawn(process.execPath, [controller, 'history', op], { shell: false })` |
| **Human decision** | `node "$controller" state human-decision <<'JSON'` | `$jsonPayload \| & node "$controller" state human-decision` | `spawn(process.execPath, [controller, 'state', 'human-decision'], { shell: false })` |

### 3. Windows PowerShell invocation snippet

```powershell
# $jsonPayload contains the exact JSON body of the chosen state or checkpoint example below.
# Match arguments to that body: @('state', 'init'), @('state', 'checkpoint'),
# @('history', 'list'), or @() for checkpoint inference.
$arguments = @('state', 'init')
$homeDir = if (Test-Path Env:HOME) { $env:HOME } elseif ($env:USERPROFILE) { $env:USERPROFILE } else { [Environment]::GetFolderPath('UserProfile') }
if (-not $homeDir -or -not [System.IO.Path]::IsPathRooted($homeDir)) { throw 'Invalid HOME' }
$controller = Join-Path $homeDir '.evcrate\bin\evcrate-advisor'
if (-not (Test-Path -LiteralPath $controller -PathType Leaf)) { throw 'Controller not found' }
$previousEncoding = $OutputEncoding
try {
    $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
    $output = @($jsonPayload | & node "$controller" @arguments)
    $exitCode = $LASTEXITCODE
} finally {
    $OutputEncoding = $previousEncoding
}
if ($exitCode -ne 0) { throw "Advisor exited with status $exitCode" }
if ($output.Count -ne 1 -or $output[0] -isnot [string]) { throw 'Unexpected advisor stdout framing' }
$result = $output[0] | ConvertFrom-Json
if ($result -isnot [pscustomobject]) { throw 'Unexpected advisor response shape' }
$request = $jsonPayload | ConvertFrom-Json
# For the state init example: other operations need their own expected envelope.
if ($result.protocol -ne 'evcrate-advisor-state' -or $result.version -ne 1 -or
    $result.operation -ne 'init' -or
    $result.status -ne 'STATE_READY' -or $result.state.task_revision -ne 1 -or
    $result.state.task_run_id -ne $request.task_run_id) {
    throw 'Unexpected advisor state response'
}
```

### 4. Programmatic Node invocation across hosts

For each operation use `spawn(process.execPath, [controller, ...args], { shell: false, stdio: ['pipe', 'pipe', 'pipe'] })`, where `controller` is the absolute HOME-owned script. Register bounded output, error, and close handlers before `child.stdin.end(jsonPayload, 'utf8')`; parse and validate the operation's response only after the process closes. Use the exact JSON body shown below as `jsonPayload`; never place it in argv. For Bun-hosted harnesses, resolve the system Node executable path rather than `process.execPath`.
### 5. Explicit caller state and counsel agent boundaries

1. **Tool-less counsel agent**: The advisor agent (`advisor.md`) is strictly tool-less (`tools: none`). It cannot bootstrap task state, execute controller CLI commands, or recurse into another advisor. Never instruct the counsel agent to invoke itself or the controller.
2. **Explicit requests require caller state management**: Both explicit `--advice` command invocations and named checkpoints require active task state. The caller workflow owns the state lifecycle and must execute the state machine (`init` -> `checkpoint` -> controller -> `state get` -> `disposition` -> `outcome` -> `complete`).
3. **Interactive human decision**: State transition `state human-decision` requires authentic interactive console challenge via `/dev/tty` (POSIX) or verified `CONIN$` / `CONOUT$` (Windows). Conversational approval text in chat cannot satisfy or bypass a `needs_human` durable state gate; headless or detached environments fail closed to `needs_human`.
4. **Terminal results and error handling**: Only an `ADVICE_READY` envelope completes the advice gate (exit code 0). Any `FAILED` envelope, nonzero exit code, process crash, timeout, or malformed JSON leaves the advice gate incomplete. Dependent mutations must never proceed without valid counsel.

## Caller lifecycle binding

This is the single caller-side lifecycle for explicit advice mode and named
checkpoints. The controller remains authoritative for freshness, authorized
scope, revisions, correction accounting, and human gates; callers must not
weaken or bypass those checks.

### Plan progress and phase reconciliation

Apply this section before selecting a phase, dispatching phase writers, or
continuing a dependency batch, including when the current command omits
`--advice`. It separates completion authority from its administrative display.

**Mode and authority**

- An ordinary plan with no advice-controlled evidence keeps normal `plan.md`
  status updates after the command's required approval and validation. Do not
  initialize controller state or require receipts merely for ordinary tracking.
- Explicit advice mode, an applicable active advice run, or a named checkpoint
  activates the advice lifecycle for that run. Preserve its identity, revisions,
  counsel, disposition, outcome and gates even if a later caller omits the flag.
- A completed historical advice run does not require a fresh advice run for a
  new default-mode phase. It does protect its captured plan/status/evidence from
  administrative overwrites. Absence of `--advice` never unseals those artifacts.
- For an advice-controlled plan, `<plan-dir>/progress.md` is the current overview;
  `plan.md` retains scope, dependencies and historical snapshot wording. The
  overview is derived, never completion authority or implementation permission.
  Distinguish current status, captured status, completion basis/scope, evidence
  links, next phase and unresolved prerequisites. Never label authoring proof as
  live qualification, or ordinary default completion as durable advice completion.

**Reconcile before selection**

1. Read the selected plan, phase contracts, existing run handoff/finalization
   records and phase receipts. Discover runs from those records and supplied
   caller context, not from plan-table status, a bare phase label or newest UUID.
   Missing `progress.md` does not mean no advice history. An unreadable source is
   an error, not evidence that no history exists.
2. Preserve an applicable active run/action before considering new work. Its
   stale, pending, correction and human gates remain binding; no replacement
   UUID, implicit refresh, duplicate action or fresh consultation to evade them.
3. For claimed advice completion, use the host-aware read-only `state get` for
   the identified run and reconcile its completion evidence with the receipt.
   Match project identity/root, repository-relative plan and phase paths,
   controller phase ID, run, revisions, approved scope and snapshot digest.
   The controller has no separate plan-ID field: establish the plan association
   from captured task/evidence paths and the receipt, never phase-ID equality alone.
   Successful completion requires a matching `complete` operation in the durable
   ledger and the accepted, resolved outcome it sealed. `gate_status: completed`
   alone is insufficient: operator abandonment also sets that flag.
4. Missing receipt plus sufficient matching durable evidence permits receipt
   reconstruction. A receipt or overview alone cannot resolve contradictory or
   unavailable controller evidence: show last-recorded completion separately
   from current verification, stop dependent execution and identify the missing
   evidence. Do not downgrade a recorded success into work to rerun. Missing
   plan/run association or conflicting scope likewise blocks automatic selection.
5. Select only incomplete scope whose dependencies are established, then check
   execution prerequisites and existing approval gates. An explicitly requested
   already-completed phase is a no-op for that scope, not implicit reauthorization.
   Apply the same rule to every parallel batch and automatic next-phase loop.
   Publish the selected phase, basis, overview path and outstanding prerequisites.

**Receipt and overview publication**

- The parent is the single publisher. Before first capture of a new plan, add
  navigation from `plan.md` to `progress.md` and record the plan/phase association
  in the task/evidence and run handoff. For an already sealed plan, do not add a
  link in place; startup and final output identify the overview and stale table.
- Keep the live overview and planned completion-receipt destination outside
  `task.authorized_paths`, `baseline_paths`, checkpoint evidence/artifacts and
  selected Git transitions. They are bounded administrative outputs, not
  substantive phase finalization. Cite immutable receipts in later reviews,
  never the live overview. Never remove a path from an existing captured
  manifest to make it mutable. If an intended destination is already captured,
  stop that publication and report the conflict; preserve the snapshot.
- After successful `state complete`, save an immutable phase completion receipt
  under `<plan-dir>/reports/`, identifying project/plan, phase, approved scope,
  run, completion operation/revision, evidence revision, matching accepted
  disposition/resolved outcome and approved baseline digest, with links to
  retained reviewed evidence and validation. Preserve the actual completion
  response or an exact reference to its durable record; never invent IDs or
  imply that the digest itself preserves the original file bytes.
  Reuse an existing receipt only when its full completion identity matches.
  The first receipt may use `<phase-id>-completion-receipt.md`; additional
  authorized scopes/runs use `<phase-id>-<task-run-id>-completion-receipt.md`,
  or `<phase-id>-default-<scope-revision-label>-completion-receipt.md` for a
  default completion without a controller run. Keep prior receipts immutable;
  a different valid scope is not a collision to overwrite. Discover and link
  all applicable receipts when reconciling phase coverage. A contradictory
  receipt for the same identity blocks publication. Non-plan tasks may still
  use an optional administrative receipt.
- Then update `progress.md` from reconciled evidence. This is the only mutable
  post-completion status surface; never copy DONE into sealed files, stage their
  index, broaden scope, relax prerequisites or claim later edits were reviewed.
  One parent serializes publication across parallel results. Re-read before
  replacing the overview; preserve unresolved/conflicting evidence rather than
  allowing a later-finishing writer to overwrite another phase's result.
- A new default-mode phase in an advice-controlled plan needs no controller
  lifecycle unless a named checkpoint activates one. After its normal gates,
  save an uncaptured immutable phase receipt explicitly marked
  `default approval/validation; not durable advice completion`, linking actual
  approval/validation and scope evidence, and update the overview. Do not invent
  controller IDs or overwrite prior receipts. Substantive outputs remain subject
  to their normal authorization; administrative publication grants none.
- If completion succeeds but receipt/overview publication fails, report
  `phase complete; progress publication failed` with the known run and revision.
  On the next invocation, reconcile first and repair only administrative outputs
  from sufficient evidence. Never rerun implementation, reopen completion or
  initialize a run to repair the display. A publication error is not a failed
  implementation outcome. These permissions never bypass another active run's
  capture/writer barrier or authorize Git staging/commit after sealing.


### Fresh first review (no active run)

1. Finish implementation and its actual declared validation, then wait for
   terminal reviewer output and settle all selected substantive pre-review
   documentation and artifacts. Apply a writer barrier for every writer that
   can affect selected evidence or artifacts. The parent gathers child terminal
   artifacts and actual changed paths before capture; children do not call state
   APIs or stage behind the parent.
2. The parent builds one snapshot manifest:
   `baseline_paths = task.authorized_paths ∪ evidence.files[*].path ∪ evidence.artifacts[*].path`.
   Baseline membership captures freshness; it does not grant write permission.
   Only `task.authorized_paths` authorize writes. Keep selected read-only
   references in the baseline and evidence, never in writable scope. Declare
   planned substantive report, documentation, and status paths in
   `task.authorized_paths` if they may be written later, and include them in
   `baseline_paths` even when a planned output does not exist yet.
3. Run `state init` exactly once for the new run, immediately before the first
   checkpoint reservation. Do not mutate any captured path or selected Git
   index/status identity between capture and reservation. If no earlier advice
   checkpoint exists, do not initialize at command entry merely to track
   implementation work.

### Active run and handoffs

If `state get` shows an active direction, decision, or stuck run, continue that
run: retain its `task_run_id`, phase and project root, current task/evidence
revisions, prior consultation/counsel, disposition, outcome, and correction
accounting. Handoffs preserve explicit advice mode and this context without
repeating consultations; ordinary stateless routers stay stateless until a
named checkpoint requires state. `get` reads state; it does not refresh a stale
baseline. Never initialize a replacement UUID to bypass stale evidence, scope,
or counters.

One parent owns all durable state operations and integrates child results.
Before authorized bounded writes, require `accept` with a registered correction
action for the current counsel. Finish an already-active action without duplicating
it: complete its bounded work (including authorized reports or documents), run its
declared validation, and record a truthful matching `outcome` with actual changed
paths. A successful outcome advances the baseline; use its returned revisions and
the same run for the next checkpoint. Never reserve while that action is unfinished.

For `reject-with-evidence`, `need-evidence`, or `reconcile` without an active action,
collect read-only evidence or an explicit resolution while keeping the captured
baseline unchanged, then obtain fresh same-run counsel before corrective mutation
or a resolved correction outcome. This evidence-only consultation does not require
an invented work/outcome cycle. Register accepted work only after that counsel.

Freeze every path in the current baseline—not just files cited in the current
checkpoint—and the selected Git index/status identity from evidence/baseline
capture through reservation, inference, and disposition. After the final outcome,
freeze the same captured snapshot through `state complete`. Ignored planned files must
be listed explicitly in the manifest; `git diff` alone is not a complete
inventory.

### Finalization and completion

Default approval scope is the whole phase, including planned substantive
documentation, reports, status files, and selected Git index transitions.
Treat each finalization write or index transition as real bounded work: it must
be authorized and registered by disposition with its declared validation
command. Perform it only after disposition, then run that validation and record
the matching outcome/action identifiers and every actual changed path. If
changed evidence warrants another review, keep the same run and follow existing
review and correction caps. Do not change captured paths or selected index
state after the final outcome or after completion.

A no-change outcome is truthful only when there were no actual changes,
including no selected index/status transition; the declared validation really
passed; disposition is `accept`; and counsel has no `must_fix` items or
`unresolved_questions`. Cautions or assumptions alone do not require invented
edits. If substantive finalization changes are still needed, no-change is not
an acceptable substitute.

Call `state complete` only after all phase-owned work, finalization, validation,
and its matching outcome have settled and the durable state permits completion.
The completion receipt is authoritative. Captured reports may say finalization
is settled and controller completion is pending, but must not claim `DONE`
before that receipt; never rewrite captured evidence after completion to add
`DONE`. For plan phases, publish the required immutable receipt and mutable
overview under `Plan progress and phase reconciliation`, outside the captured
snapshot. For other tasks an administrative receipt is optional and must remain
outside the snapshot, identify it, and make no claim that later substantive edits
were reviewed. A review-only run is permissible only when its declared scope
explicitly excludes later substantive finalization; it is not whole-phase approval.

If a run is stale, stop rather than reinitialize, implicitly refresh, or use
scope revision as refresh. A stale init-only run requires authentic operator
abandonment through the existing human gate before a new run may start. Never
use a replacement UUID to bypass that handling.

## Mandatory task-state lifecycle and controller execution

V2 checkpoint consultations require active task state. The state machine transitions:
`init` (rev 0 -> 1) -> `checkpoint` reserve (rev 1 -> 2) -> controller claim & attach (rev 2 -> 3 -> 4) -> `state get` (reads rev 4) -> `disposition` (rev 4 -> 5) -> bounded work -> `outcome` (rev 5 -> 6) -> `complete` (rev 6 -> completed).

**Host-aware state execution:** The wire protocol payloads below are identical across platforms. POSIX callers execute the bash snippets as shown. Windows PowerShell and programmatic Node callers follow the host-aware invocation contract above, passing the exact JSON payloads via BOM-free UTF-8 stdin without duplicated schema definitions.

### 1. Initialize task state

Initialize the task run and capture all selected paths in the baseline manifest (advances revision from 0 to 1). Baseline membership records evidence; only `task.authorized_paths` grant write authority:

For this example, `source.txt` contains `initial user work` plus one final newline and `contract.txt` contains `checked read-only contract` plus one final newline; the digests below hash those complete bytes. `contract.txt` is read-only evidence, not write authority.

```bash
node "$HOME/.evcrate/bin/evcrate-advisor" state init <<'JSON'
{
  "protocol": "evcrate-advisor-state",
  "version": 1,
  "operation": "init",
  "task_run_id": "00000000-0000-4000-8000-000000000000",
  "operation_id": "00000000-0000-4000-8000-000000000001",
  "expected_revision": 0,
  "payload": {
    "phase_id": "phase-08",
    "task": {
      "goal": "Current workflow task goal",
      "non_goals": ["Unrelated refactoring"],
      "authorized_paths": ["source.txt"],
      "scope_rationale": "Owned task boundary",
      "invariants": ["Preserve existing tests and user baseline"],
      "success_criteria": ["All relevant validation tests pass"]
    },
    "baseline_paths": ["source.txt", "contract.txt"]
  }
}
JSON
```

### 2. Reserve checkpoint

Before invoking inference, reserve the checkpoint gate (advances revision from 1 to 2 and returns a unique `consultation_id`). Evidence MUST include declared validation commands:

```bash
node "$HOME/.evcrate/bin/evcrate-advisor" state checkpoint <<'JSON'
{
  "protocol": "evcrate-advisor-state",
  "version": 1,
  "operation": "checkpoint",
  "task_run_id": "00000000-0000-4000-8000-000000000000",
  "operation_id": "00000000-0000-4000-8000-000000000002",
  "expected_revision": 1,
  "payload": {
    "checkpoint": {
      "protocol": "evcrate-advisor-checkpoint",
      "version": 2,
      "task_run_id": "00000000-0000-4000-8000-000000000000",
      "checkpoint_id": "checkpoint-review-step-4",
      "phase_id": "phase-08",
      "task_revision": 1,
      "evidence_revision": 0,
      "checkpoint": "review:step-4",
      "kind": "review",
      "question": "Which safe action should follow this terminal review?",
      "task": {
        "goal": "Current workflow task goal",
        "non_goals": ["Unrelated refactoring"],
        "authorized_paths": ["source.txt"],
        "scope_rationale": "Owned task boundary",
        "invariants": ["Preserve existing tests and user baseline"],
        "success_criteria": ["All relevant validation tests pass"]
      },
      "proposal": {
        "next_action": "Proceed to next workflow step or apply bounded correction",
        "rationale": "Terminal review completed with score X/10",
        "intended_changed_paths": ["source.txt"]
      },
      "evidence": {
        "summary": "Terminal review completed. Tests passed.",
        "files": [
          {
            "path": "source.txt",
            "excerpt": "initial user work",
            "digest": "78be05fd4e2291fb9eb0b5f9e1cf560bc8e14f7d78406d29a5d86f878ceb69f8"
          },
          {
            "path": "contract.txt",
            "excerpt": "checked read-only contract",
            "digest": "d6fbcd17e94584132e555b6ce1b1d37cff67b54aad1f99ab0a9f6bc0dc6b7dd9"
          }
        ],
        "validation_results": [
          {
            "suite": "test",
            "command": "npm test",
            "status": "passed",
            "passed": 1,
            "failed": 0,
            "details": null
          }
        ],
        "artifacts": []
      },
      "prior": {
        "prior_consultation_id": null,
        "prior_counsel": null,
        "prior_disposition": null,
        "observed_outcome": null
      }
    }
  }
}
JSON
```

### 3. Central controller invocation

Pass the exact reserved checkpoint JSON directly to the central controller via the host-aware invocation contract (explicit Node invocation on all hosts):

```bash
node "$HOME/.evcrate/bin/evcrate-advisor" <<'JSON'
{
  "protocol": "evcrate-advisor-checkpoint",
  "version": 2,
  "task_run_id": "00000000-0000-4000-8000-000000000000",
  "checkpoint_id": "checkpoint-review-step-4",
  "phase_id": "phase-08",
  "task_revision": 1,
  "evidence_revision": 0,
  "checkpoint": "review:step-4",
  "kind": "review",
  "question": "Which safe action should follow this terminal review?",
  "task": {
    "goal": "Current workflow task goal",
    "non_goals": ["Unrelated refactoring"],
    "authorized_paths": ["source.txt"],
    "scope_rationale": "Owned task boundary",
    "invariants": ["Preserve existing tests and user baseline"],
    "success_criteria": ["All relevant validation tests pass"]
  },
  "proposal": {
    "next_action": "Proceed to next workflow step or apply bounded correction",
    "rationale": "Terminal review completed with score X/10",
    "intended_changed_paths": ["source.txt"]
  },
  "evidence": {
    "summary": "Terminal review completed. Tests passed.",
    "files": [
      {
        "path": "source.txt",
        "excerpt": "initial user work",
        "digest": "78be05fd4e2291fb9eb0b5f9e1cf560bc8e14f7d78406d29a5d86f878ceb69f8"
      },
      {
        "path": "contract.txt",
        "excerpt": "checked read-only contract",
        "digest": "d6fbcd17e94584132e555b6ce1b1d37cff67b54aad1f99ab0a9f6bc0dc6b7dd9"
      }
    ],
    "validation_results": [
      {
        "suite": "test",
        "command": "npm test",
        "status": "passed",
        "passed": 1,
        "failed": 0,
        "details": null
      }
    ],
    "artifacts": []
  },
  "prior": {
    "prior_consultation_id": null,
    "prior_counsel": null,
    "prior_disposition": null,
    "observed_outcome": null
  }
}
JSON
```

The controller claims the checkpoint (advancing revision 2 -> 3), executes inference,
attaches the envelope result (advancing revision 3 -> 4), and writes history.
Only an `ADVICE_READY` envelope completes the advice gate. Any `FAILED` envelope,
missing output, malformed output, or timeout leaves the gate incomplete.

### 4. Read current state

Read the fresh state to inspect `task_revision` (now 4) and `last_consultation_id` (matching the envelope's `correlation_id`):

```bash
node "$HOME/.evcrate/bin/evcrate-advisor" state get <<'JSON'
{
  "protocol": "evcrate-advisor-state",
  "version": 1,
  "operation": "get",
  "task_run_id": "00000000-0000-4000-8000-000000000000",
  "operation_id": null,
  "expected_revision": null,
  "payload": {}
}
JSON
```

### 5. Record executor disposition

Advice is non-binding. The executor evaluates counsel and records an explicit
disposition using `state.task_revision` (4) and returned `consultation_id`:

- `accept`: agree with counsel; apply bounded changes within authorized scope.
- `reject-with-evidence`: disagree with counsel; record causal rationale and evidence.
- `need-evidence`: missing facts identified; collect evidence and re-consult.
- `reconcile`: resolve contradictory findings or boundary mismatches.

**Path A: Applying bounded correction (with code changes)**:
Record the correction choice linking `action_id`, `episode_id`, and a declared `validation_command` (advances revision from 4 to 5):

```bash
node "$HOME/.evcrate/bin/evcrate-advisor" state disposition <<'JSON'
{
  "protocol": "evcrate-advisor-state",
  "version": 1,
  "operation": "disposition",
  "task_run_id": "00000000-0000-4000-8000-000000000000",
  "operation_id": "00000000-0000-4000-8000-000000000003",
  "expected_revision": 4,
  "payload": {
    "consultation_id": "11111111-1111-4000-8000-111111111111",
    "evidence_revision": 0,
    "action": "accept",
    "rationale": "Accepted counsel to apply bounded correction.",
    "correction": {
      "action_id": "22222222-2222-4000-8000-222222222222",
      "episode_id": "episode-1",
      "validation_command": "npm test"
    }
  }
}
JSON
```

**Path B: No-change outcome (advice accepted; no changes required)**:
Use `correction: null` only when the existing state is accepted without modification. Cautions or assumptions alone do not require invented edits, but the no-change outcome is valid only with zero actual changes, passed declared validation, `accept` disposition, and no `must_fix` items or `unresolved_questions`.

```bash
node "$HOME/.evcrate/bin/evcrate-advisor" state disposition <<'JSON'
{
  "protocol": "evcrate-advisor-state",
  "version": 1,
  "operation": "disposition",
  "task_run_id": "00000000-0000-4000-8000-000000000000",
  "operation_id": "00000000-0000-4000-8000-000000000010",
  "expected_revision": 4,
  "payload": {
    "consultation_id": "11111111-1111-4000-8000-111111111111",
    "evidence_revision": 0,
    "action": "accept",
    "rationale": "Only cautions and assumptions; no must_fix or unresolved_questions; accepted with no changes.",
    "correction": null
  }
}
JSON
```

### 6. Record validation outcome

After applying bounded edits and running validation (advances revision from 5 to 6):

**Path A (Correction applied)**: Reuses `consultation_id`, `action_id`, and `episode_id`:

```bash
node "$HOME/.evcrate/bin/evcrate-advisor" state outcome <<'JSON'
{
  "protocol": "evcrate-advisor-state",
  "version": 1,
  "operation": "outcome",
  "task_run_id": "00000000-0000-4000-8000-000000000000",
  "operation_id": "00000000-0000-4000-8000-000000000004",
  "expected_revision": 5,
  "payload": {
    "consultation_id": "11111111-1111-4000-8000-111111111111",
    "action_id": "22222222-2222-4000-8000-222222222222",
    "episode_id": "episode-1",
    "result": "resolved",
    "validation": {
      "suite": "test",
      "command": "npm test",
      "status": "passed",
      "passed": 1,
      "failed": 0,
      "details": null
    },
    "actual_changed_paths": ["source.txt"]
  }
}
JSON
```

**Path B (No changes required)**: Reuses `consultation_id`, with `action_id: null`, `episode_id: null`, and `actual_changed_paths: []`:

```bash
node "$HOME/.evcrate/bin/evcrate-advisor" state outcome <<'JSON'
{
  "protocol": "evcrate-advisor-state",
  "version": 1,
  "operation": "outcome",
  "task_run_id": "00000000-0000-4000-8000-000000000000",
  "operation_id": "00000000-0000-4000-8000-000000000011",
  "expected_revision": 5,
  "payload": {
    "consultation_id": "11111111-1111-4000-8000-111111111111",
    "action_id": null,
    "episode_id": null,
    "result": "resolved",
    "validation": {
      "suite": "test",
      "command": "npm test",
      "status": "passed",
      "passed": 1,
      "failed": 0,
      "details": null
    },
    "actual_changed_paths": []
  }
}
JSON
```

*(Note: If disposition action is `reject-with-evidence`, `need-evidence`, or `reconcile`, new evidence or an explicit resolution must be collected, followed by a fresh consultation before a resolved outcome can complete the gate.)*

### 7. Complete task run

When all workflow tasks and substantive finalization settle, `state complete` advances the same run from its latest revision to `completed`. Complete only after the final validation and matching outcome; after that outcome, freeze every captured path and selected Git index/status identity through this operation:

```bash
node "$HOME/.evcrate/bin/evcrate-advisor" state complete <<'JSON'
{
  "protocol": "evcrate-advisor-state",
  "version": 1,
  "operation": "complete",
  "task_run_id": "00000000-0000-4000-8000-000000000000",
  "operation_id": "00000000-0000-4000-8000-000000000005",
  "expected_revision": 6,
  "payload": {}
}
JSON
```

## Review caps, correction state machine, and human handoff

1. **Executor review cap is not durable completion authority**:
   - At the three-review-cycle cap, the executor may ask whether to accept noted issues or abort, but user acknowledgement only stops further review cycles when the durable state permits. It cannot supply a missing disposition, validation, or outcome, override `needs_human`, or substitute for a successful `state complete` receipt.
   - **Durable Correction Exhaustion** (`correction_count === 3`, `gate_status === 'needs_human'`): conversational approval text CANNOT bypass or complete the durable state gate! Callers MUST run `state get`, obtain the fresh `task_revision` (16 in the three-failed-cycle sequence), and execute `state human-decision` via the interactive `/dev/tty` (POSIX) or verified `CONIN$` / `CONOUT$` (Windows) challenge (`observeTerminalDecision`) to authorize continuation, scope revision, or abandonment. If a controlling terminal is unavailable, the state gate remains `needs_human` and the workflow stops for operator intervention.
2. **Correction state machine**:
   - Tracks durable completed unsuccessful correction/validation attempts (`correction_count`).
   - Attempt 1: First occurrence -> normal bounded remediation.
   - Attempt 2: Second matching occurrence -> invoke `stuck:<blocker-signature>`,
     record disposition, apply bounded fix, re-run validation.
   - Attempt 3: Third occurrence -> apply final fix, re-run validation.
   - On the 3rd failed correction-validation cycle (`correction_count === 3`),
     durable state enters `needs_human`.
   - Never reset the correction counter on superficial symptom renames.
3. **Human decision recording**:
   - In the illustrated three-cycle sequence, init (rev 1) -> cycle 1 (revs 2-6) -> cycle 2 (revs 7-11) -> cycle 3 (revs 12-16)
     leaves `task_revision` at 16. When durable state enters `needs_human`, `human-decision` authorizes continuation:
   ```bash
   node "$HOME/.evcrate/bin/evcrate-advisor" state human-decision <<'JSON'
   {
     "protocol": "evcrate-advisor-state",
     "version": 1,
     "operation": "human-decision",
     "task_run_id": "00000000-0000-4000-8000-000000000000",
     "operation_id": "00000000-0000-4000-8000-000000000006",
     "expected_revision": 16,
     "payload": {
       "action": "continue",
       "rationale": "Human continuation authorized after three failed correction outcomes.",
       "authorized_paths": []
     }
   }
   JSON
   ```
   - *Interaction attestation*: The state CLI observes human authorization via an
     interactive `/dev/tty` (POSIX) or console `CONIN$` / `CONOUT$` (Windows) challenge
     (`observeTerminalDecision`). In non-interactive or headless environments where a
     controlling terminal is unavailable, the state gate remains `needs_human` and the
     workflow halts for operator intervention; conversational approval text is never forged
     as an attestation event.
## Cooperative timing and boundary verification

1. **Cooperative timing**: In-flight independent work (orientation, research,
   reading) continues safely; only dependent mutations wait for counsel.
2. **Pre-write verification**: Verify that intended changes are within
   `authorized_paths` and that the workspace baseline is fresh.
3. **Post-change verification**: Inspect `git status --porcelain=v2 -z` and
   verify that actual changes match `authorized_paths`.
4. **User baseline preservation**: Pre-existing user modifications, untracked
   files, and unrelated changes must be preserved. Never auto-reset or revert
   unrelated user work.
5. **Capability boundary**: Mentoring invocation is supported across all hosts;
   pre-edit write checks are advisory-only unless native task-aware hook
   interception is verified.
