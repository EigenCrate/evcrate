# Advisor Supervision Migration

## Who this affects

This release changes the advisory syntax for implementation commands. It applies
to `/bootstrap`, `/code`, `/cook`, and `/fix` variants that support checkpoint
counsel.

Replace a final `@advisor` with a final `--advice`:

```text
/code add caching @advisor   # old: @advisor is ordinary task text
/code add caching --advice   # new: explicit checkpoint counsel
```

`@advisor` is not a deprecated alias and has no grace window. Every occurrence,
including a final standalone token, remains ordinary unchanged work input.

Use the same final-token rule across supported implementation commands:

| Command | Checkpoint counsel | Ordinary task text |
|---|---|---|
| `/bootstrap` | `/bootstrap create a CLI --advice` | `/bootstrap create @advisor notes` |
| `/code` | `/code add caching --advice` | `/code read @advisor.md` |
| `/cook` | `/cook add caching --advice` | `/cook annotate @advisor input` |
| `/fix` | `/fix repair cache --advice` | `/fix path/@advisor/config` |

When a supported command falls back to another implementation command, it forwards
`WORK_ARGUMENTS`: explicit mode appends exactly one final `--advice`, while default
mode forwards no mode token. For example, `/cook add caching --advice` may hand off
as `/code add caching --advice`; `/fix:hard repair cache --advice` follows the
same one-token rule. The handoff never recreates `@advisor` mode.

## Choose the advisory surface

| Need | Use | Result |
|---|---|---|
| Extra counsel during implementation | Final `--advice` on a supported implementation command | A fresh, non-binding advisor at named review, repeated-blocker, or decision checkpoints |
| Help framing a problem before implementation | `/advise <prompt-or-url>` | An inline, interview-first advice session in the main conversation |
| Claude relay interview | `/advise <prompt-or-url> --agent` | Claude-only versioned relay; the main conversation remains the user interface and report writer |

`--advice` is exact, case-sensitive, whitespace-delimited, final, and may have
trailing whitespace. Duplicate standalone flags reject. Quoted, embedded,
suffixed, differently cased, and non-final forms stay ordinary input. A lone
`--advice` follows the command's usual empty-input handling.

## `/advise` journey

Inline `/advise` asks one concise substantive question at a time, up to eight
discovery questions. It then proposes one reframed problem and requires an
explicit confirmation or correction, with at most two reframe cycles. It returns
candid advice and writes a sanitized Markdown report to the active plan's
`reports/` directory or `plans/reports/` when no plan is active.

For Claude only, one exact final standalone `--agent` enables relay v1. Duplicate
standalone flags reject; quoted, embedded, suffixed, differently cased, and
non-final forms remain inline prompt text. Cancellation, interruption,
unavailable model, malformed relay envelope, state failure, and report failure
all fail closed: relay never silently falls back to inline behavior.

## Target capability matrix

| Target | `--advice` checkpoint | Inline `/advise` | `/advise --agent` |
|---|---|---|---|
| Claude | Supported | Supported | Supported (relay v1) |
| Codex | Supported; advisor maps to `gpt-5.6-sol`/high | Supported | Reject: `ADVISE_AGENT_RELAY_UNSUPPORTED_CODEX` |
| Pi | Supported; advisor semantic role is `strong` | Supported | Reject: `ADVISE_AGENT_RELAY_UNSUPPORTED_PI` |
| Gemini | Supported; advisor maps to target-native `pro` | Supported | Reject: `ADVISE_AGENT_RELAY_UNSUPPORTED_GEMINI` |
| Antigravity | Supported | Supported | Reject: `ADVISE_AGENT_RELAY_UNSUPPORTED_ANTIGRAVITY` |

An unsupported target rejects relay before advisor delegation or relay-state
creation. It must not silently run an inline interview instead. Generated files
are projections, not proof of a capability; deterministic build/check and
target-aware help tests are the evidence.

### Workflow lookup after publication

The generated checkpoint commands prefer a project-local workflow override and
fall back to the published HOME resource when that override is absent. Codex
reads `.codex/workflows/advisor-mentoring.md` or
`~/.codex/workflows/advisor-mentoring.md`; Antigravity reads
`.antigravity/workflows/advisor-mentoring.md` or
`~/.gemini/config/workflows/advisor-mentoring.md`. A missing local path is not a
failure condition.

## Relay state and privacy

Claude relay state lives under `${TMPDIR:-/tmp}/evcrate/advice/v1/` in a sanitized,
bounded, owner-only, untracked invocation directory. Paused and failed state is
kept for seven days to support recovery. A completed invocation is replaced by a
24-hour tombstone. Reports and state reject unredacted credentials.

Do not add a broker, advisor MCP service, launcher, provider selector, quota,
ledger, audit transport, or approval bypass. `advisor-strategy` is a static
rubric; the normal advisor subagent provides fresh, non-binding counsel and does
not edit, approve, select providers, or bypass host controls.

## Build and troubleshooting

Edit only canonical `.evcrate/source/.claude` files or declared target overlays.
Never hand-edit generated `.codex`, `.agents`, `.pi`, `.gemini`, or
`.antigravity` trees. Validate changes with the focused suites, then run:

```bash
python3 distribute.py --build
python3 distribute.py --build
python3 distribute.py --check
```

The two builds must be deterministic. If a target help page claims an unsupported
relay is available, rebuild from canonical sources and re-run the target-aware
help tests. Build/check do not publish to HOME; publication requires separate
user authorization.
