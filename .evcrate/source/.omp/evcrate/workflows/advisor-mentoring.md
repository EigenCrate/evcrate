<!-- EVCRATE_MENTORING_CAPABILITIES_START -->
<!-- EVCRATE_CAPABILITY: mentoring/supported/v2 -->
<!-- EVCRATE_CAPABILITY: write-checks/omp/advisory-only/v1 -->
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
`.omp/evcrate/workflows/advisor-mentoring.md` if present; otherwise read `~/.omp/agent/evcrate/workflows/advisor-mentoring.md`; this contract supplies bounded evidence
and does not duplicate route or adapter selection.

## Mandatory task-state lifecycle and controller execution

V2 checkpoint consultations require active task state. The state machine transitions:
`init` (rev 0 -> 1) -> `checkpoint` reserve (rev 1 -> 2) -> controller claim & attach (rev 2 -> 3 -> 4) -> `state get` (reads rev 4) -> `disposition` (rev 4 -> 5) -> bounded work -> `outcome` (rev 5 -> 6) -> `complete` (rev 6 -> completed).

### 1. Initialize task state

Initialize the task run and capture baseline for authorized paths (advances revision from 0 to 1):

```bash
~/.evcrate/bin/evcrate-advisor state init <<'JSON'
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
    "baseline_paths": ["source.txt"]
  }
}
JSON
```

### 2. Reserve checkpoint

Before invoking inference, reserve the checkpoint gate (advances revision from 1 to 2 and returns a unique `consultation_id`). Evidence MUST include declared validation commands:

```bash
~/.evcrate/bin/evcrate-advisor state checkpoint <<'JSON'
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

Pass the exact reserved checkpoint JSON directly to `evcrate-advisor`:

```bash
~/.evcrate/bin/evcrate-advisor <<'JSON'
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
~/.evcrate/bin/evcrate-advisor state get <<'JSON'
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
~/.evcrate/bin/evcrate-advisor state disposition <<'JSON'
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

**Path B: Concern-free no-change outcome (advice accepted, no code changes required)**:
When the advisor returns `ADVICE_READY` with no concerns and existing code is accepted without modification, disposition records `correction: null` (advances revision from 4 to 5):

```bash
~/.evcrate/bin/evcrate-advisor state disposition <<'JSON'
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
    "rationale": "Direction verified safe; no code modifications needed.",
    "correction": null
  }
}
JSON
```

### 6. Record validation outcome

After applying bounded edits and running validation (advances revision from 5 to 6):

**Path A (Correction applied)**: Reuses `consultation_id`, `action_id`, and `episode_id`:

```bash
~/.evcrate/bin/evcrate-advisor state outcome <<'JSON'
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

**Path B (No code changes required)**: Reuses `consultation_id`, with `action_id: null`, `episode_id: null`, and `actual_changed_paths: []`:

```bash
~/.evcrate/bin/evcrate-advisor state outcome <<'JSON'
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

When all workflow tasks settle (advances revision from 6 to `completed`):

```bash
~/.evcrate/bin/evcrate-advisor state complete <<'JSON'
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

1. **Executor Review Cap vs Durable Human Continuation**:
   - **Executor Review Cap** (3 review cycles reached, `correction_count < 3`): executor stops
     and asks the user via `ask the user`: "Approve with noted issues" or "Abort workflow".
     If the user approves, executor records user acknowledgement and completes the workflow
     without launching another review cycle.
   - **Durable Correction Exhaustion** (`correction_count === 3`, `gate_status === 'needs_human'`):
     conversational approval text CANNOT bypass or complete the durable state gate!
     Callers MUST run `state get`, obtain the fresh `task_revision` (16 in the three-failed-cycle
     sequence), and execute `state human-decision` via the interactive `/dev/tty` challenge
     (`observeTerminalDecision`) to authorize continuation, scope revision, or abandonment.
     If a controlling terminal is unavailable, the state gate remains `needs_human` and the workflow
     stops for operator intervention.
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
   ~/.evcrate/bin/evcrate-advisor state human-decision <<'JSON'
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
     interactive `/dev/tty` challenge (`observeTerminalDecision`). In non-interactive
     or headless environments where a controlling terminal is unavailable, the
     state gate remains `needs_human` and the workflow presents host UI for human
     direction; conversational approval text is never forged as an attestation event.
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
