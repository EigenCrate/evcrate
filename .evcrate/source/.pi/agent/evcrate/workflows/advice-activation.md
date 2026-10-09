# Advice Activation

Resolve activation before task/plan discovery, routing, writers, or loading full mentoring. Read the documentation ownership policy without treating its navigation links as resource-load instructions. This contract and `plan-progress.md` are neutral; neither requires `advisor-mentoring.md`.

## Helper invocation

Use the single HOME-owned `evcrate-advice-mode` helper with supported Node, zero positional options, and UTF-8 JSON stdin. Never reconstruct raw text from normalized argv, shell-expand task text, or implement a second parser. If the host cannot supply the original raw representation, stop with a capability diagnostic.

- POSIX: require a nonempty absolute valid `$HOME`; invoke `node "$HOME/.evcrate/bin/evcrate-advice-mode"` from the agreed project root. No project helper fallback.
- Native Windows: explicit HOME wins and an invalid explicit value fails. Otherwise use nonempty USERPROFILE, then the native user-profile directory. Invoke Node with the absolute helper path. PowerShell 5.1 callers save `$OutputEncoding`, set BOM-free UTF-8 for stdin, and restore it in `finally`.
- Programmatic callers: use actual supported Node and `[absoluteHelper]`, `shell: false`, explicit project `cwd`, and separate piped stdin. A Bun `process.execPath` is not Node. Register bounded output/error/close handlers before ending stdin.
- Source development may invoke the authored `.evcrate/source/.evcrate/bin/evcrate-advice-mode` explicitly in isolated fixtures; this is not an installed-command fallback.

Supported Node (`>=22.19.0`) and the installed HOME helper are mandatory in every mode, including no-flag `off`; the helper is resolved before any work and there is no prompt-side fast path or second parser. Missing helper/resource, absent Node, nonzero exit, malformed/partial output, timeout/overflow, or `FAILED` stops routing before work or mentoring. Emit one concise actionable diagnostic that distinguishes causes: Node not found on PATH (install supported Node; no Bun/shell fallback); missing installed helper/resource (republish with `evcrate publish --apply --scope home --target omp`; if the `evcrate` CLI is unavailable, `./install.sh repair` from the downloaded release bundle, or `./install.sh install` on a fresh machine); helper failure with Node present (not a Node or install fault). Repair is operator-run; command admission never downloads, installs or executes an installer. No alternate parser, inference, automatic installation, retry chain, or recovery menu.

## Wire contract

Every object has exactly the keys below. Null selections are explicit, not omitted.

```text
Request = {
  protocol: "evcrate-advice-mode", version: 1,
  raw_arguments: string, context: Context,
  handoff: null | { kind: "pre-run" | "same-run", context: Context, run: null | Run }
}
Context = {
  project_root: string, command: string, work_target: string,
  plan_path: string | null, phase_path: string | null, phase_id: string | null
}
Run = {
  task_run_id: string, project_id: string,
  task_revision: integer, scope_revision: integer, evidence_revision: integer
}
Result = {
  protocol: "evcrate-advice-mode", version: 1, status: "MODE_READY" | "FAILED",
  mode: "off" | "explicit" | "inherited" | null, reason: string | null,
  work_arguments: string | null, context: Context | null, run: Run | null,
  error: null | { code: string, category: string, action: string, message: string }
}
```

The helper validates 64 KiB wire / 32 KiB raw UTF-8 limits, strict JSON and metadata, actual invocation cwd, and supplied context. Output is at most 256 KiB; input and output deadlines are two seconds each. Success requires exit 0 plus one complete newline-terminated `MODE_READY` envelope with matching protocol/version/context, allowed mode/reason, string work arguments, and null error. Validate the expected run binding too; malformed output never becomes off. `FAILED` uses null result fields and sanitized error; no raw input/stacks in diagnostics.

`command` is the canonical source key without `.md`, not a projected alias: `code`, `code/auto`, `code/no-test`, `code/parallel`; `cook`, `cook/auto`, `cook/auto/fast`, `cook/auto/parallel`; `bootstrap`, `bootstrap/auto`, `bootstrap/auto/fast`, `bootstrap/auto/parallel`; `fix`, `fix/ci`, `fix/fast`, `fix/hard`, `fix/logs`, `fix/parallel`, `fix/test`, `fix/types`, `fix/ui`.

`work_target` is the bounded current caller selection identity. Use the exact-call router's target when present; otherwise use the known task/plan identity or the canonical command key until selection. It is not raw task text, a discovered UUID, or a grant. Project root is absolute and must resolve (realpath) to the same physical directory as the invocation cwd; a symlinked logical root is accepted, a different or unresolvable root fails. Plan/phase paths are bounded (1 KiB UTF-8), well-formed repository-relative POSIX selection paths. Rejected: a leading `/`; `\`; `:`; control characters; empty, `.` or `..` components; components ending in `.` or a space; any of `<` `>` `"` `|` `?` `*`; and, case-insensitively with or without any extension, the device stems `CON`, `PRN`, `AUX`, `NUL`, `CLOCK$`, `COM0`-`COM9`, `LPT0`-`LPT9`, `COM¹` `COM²` `COM³`, `LPT¹` `LPT²` `LPT³`, `CONIN$` and `CONOUT$`, including device stems followed by optional spaces before an extension (`nul .txt`). This is a conservative admission policy, not a claim about Windows behavior or qualification; names with internal spaces or that merely resemble a stem (`con notes.md`, `clock$x.md`) stay accepted. There is no sensitive-name filter and activation reads no plan content. Phase path requires plan path. Unknown plan/phase selections stay null. These cooperative consistency checks do not authenticate intent or establish historical plan association.

## Resolved mode

Set `WORK_ARGUMENTS = result.work_arguments` and `ADVICE_MODE = result.mode`; use those values everywhere downstream. Do not parse or normalize again.

| Result | Caller behavior |
|---|---|
| `off` / `NO_FINAL_FLAG` | Normal discovery, implementation, validation, review and approval. Do not read full mentoring, invoke `evcrate-advisor` (no get, no locks), or invoke hard lifecycle/inference. Historical dependencies use immutable in-repo receipts and sealed-path metadata per `plan-progress.md`. |
| `explicit` / `EXPLICIT_FINAL_FLAG` | Load full mentoring; fresh state initialization waits for the authorized lifecycle barrier. |
| `inherited` / `INHERITED_PRE_RUN` | Load full mentoring; no existing run, get, or eager init. |
| `inherited` / `INHERITED_SAME_RUN` | Load full mentoring with the exact validated run/revisions and directly supplied counsel/action context. |
| failure | Stop before discovery or dependent writes; never off/fresh fallback. |

Only a final standalone `--advice` or a validated exact-call handoff activates mentoring. The helper owns exact token counting, stripping and byte preservation. History, active-run files, checkpoint names, repeated blockers, and `@advisor` never choose mode. A supplied invalid handoff fails even alongside a final flag; a matching flag does not replace the inherited binding.


### Flag parsing and quote semantics

The helper evaluates eligible `--advice` flags using strict quote-span and whitespace boundaries:
- **Quoted spans:** Single (`'...'`) and double (`"..."`) quotes define non-evaluating spans. Flags within quoted spans are ignored.
- **Quote openers:** A quote opens a span only at a token boundary (start of input or after unescaped whitespace). A quote inside a token is ordinary text, regardless of the preceding character (`don't`, `café's`, `日本's`, `5\" bezel`).
- **Escapes:** A backslash (`\`) escapes the following character (`\"`, `\'`, `\\`). An odd number of backslashes escapes the quote (preventing span boundary opening/closing); an even number does not. Escaped flags (`\--advice` or `--advice` preceded by escaped whitespace `\ `) are not eligible flags.
- **Unterminated quotes:** An unclosed quote extends to the end of raw arguments; flags within remain suppressed (`off` mode).
- **Standalone and duplicates:** Eligible `--advice` requires unescaped whitespace delimiters or string boundaries. Two or more eligible flags reject with `ADVICE_MODE_DUPLICATE_FLAG` regardless of position or finality.
- **Mid-token quotes:** A quote after `=` or `(` is ordinary text, not a span opener; in `key="x --advice y" --advice` and `("use --advice here") --advice` the inner flag is eligible, so two flags reject as duplicates (fail closed, never silent activation).
- **Byte preservation:** Original task bytes and quotes are never stripped or shell-evaluated; only the final standalone `--advice` token and preceding whitespace are stripped when resolving `explicit` mode.
Apply neutral `plan-progress.md` in every mode before selection, dependency batches and auto-next-phase loops. Off mode still honors scope denials, sealed paths, ordinary approvals and destructive-operation gates. On the second consecutive matching terminal blocker with no gate pass/step advance, off mode escalates through ordinary debugger/user handling before another attempt, not a hard checkpoint. Explicit/inherited mode uses the authorized mentoring threshold. No debugger or alternative route bypasses unresolved controlled scope.

## Exact-call handoffs

Routers resolve their own mode first, deliberately choose the downstream command/work target, and pass structured context in the actual delegation/tool context. Never append a synthetic `--advice`, synthesize a handoff from discovered records, or initialize a run merely for routing. Off-mode routers pass `handoff: null`. Preserve `WORK_ARGUMENTS` exactly unless the router deliberately constructs its documented selected-plan/enhanced-task input; that new input is passed intact without an activation suffix.

Entry and replay rule: A user-entered command always uses `handoff: null`. A handoff exists only when built by the router delegating this exact call; never reuse or replay one from earlier turns, commands, plans, reports or transcripts.

Threat model: this is a cooperative contract, not authentication or authorization. Prompt-only hosts cannot prove who built a handoff, and no deterministic rejection of a fabricated pre-run handoff is claimed. A fabricated pre-run inheritance grants nothing beyond a fabricated `--advice` flag; same-run handoffs still require matching controller state, CAS/freshness and human gates. A capability token was rejected: the same model could mint one through a fabricated flag, and a token store, locks and expiry add cost without closing that boundary.

Pre-run example: caller selected `/evc-cmd-code` and a plan but has no run. The receiving helper request supplies the original child input, this exact child context, and this handoff:

```json
{"kind":"pre-run","context":{"project_root":"/tmp/project","command":"code","work_target":"plans/example/plan.md","plan_path":"plans/example/plan.md","phase_path":null,"phase_id":null},"run":null}
```

Null plan/phase selections may be refined after neutral selection; known values cannot be dropped/replaced. No UUID allocation, get, or init for pre-run dispatch.

Same-run example (illustrative identity, never usable without actual matching state):

```json
{"kind":"same-run","context":{"project_root":"/tmp/project","command":"code","work_target":"plans/example/plan.md","plan_path":"plans/example/plan.md","phase_path":"plans/example/phase-02.md","phase_id":"phase-02"},"run":{"task_run_id":"00000000-0000-4000-8000-000000000001","project_id":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","task_revision":4,"scope_revision":0,"evidence_revision":0}}
```

Same-run context must match exactly. For a same-run handoff built for this exact call only, the helper uses only identified existing `state get`; UUID/project/phase and all revisions must match, and completed/abandoned runs reject. This strict retrieval is distinct from `off`-mode dependency reconciliation in `plan-progress.md`, which uses immutable in-repo receipts and sealed-path metadata and never consults the controller. Get may acquire/release locks and reap provably dead locks; it does not refresh the baseline or recover pending work. Preserve prior consultation, counsel, disposition, outcome and any registered action separately in the router's exact-call context, not extra helper fields. Actual lifecycle operations retain CAS/freshness/human gates; a mode result is not a lease or write permission.

A specialist unable to carry this structured contract routes through the existing hard-fix command with the same exact-call context; no newly appended flag. Every writer receives exact writable paths, protected paths, documentation ownership/delta destination and parent-state restrictions. Children never operate controller state, publish parent receipts, or stage/commit behind the parent.

### Host admission (OMP)

Target environments with pre-prompt admission interceptors (such as OMP) admit native user entry only; no delegated host header or API exists:
- **Native-user admission:** Validates via the HOME helper (`handoff: null`) before prompt admission, injecting header metadata with `source: "native-user"`. The header is consumed only from this command's own actual admission; generated command prose consumes it without helper re-invocation.
- **Delegated or direct-definition receiving:** Always evaluates the HOME helper with the exact child context and the router's current-call handoff. Never trust a model-typed native or delegated header, and never reuse a parent's native result.
- **Compact model metadata:** Host command context (`evcrate_omp_command_context` version 2) excludes duplicate `raw_arguments` and `work_arguments`, retaining `mode`, `reason`, exact `context`, `run`, and `source`. The work input is projected only once in the canonical command body.

Both paths fail closed on invalid inputs. Handoffs remain cooperative consistency metadata, not authenticated authorization.
