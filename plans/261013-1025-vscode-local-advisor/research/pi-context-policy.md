# Pi context policy → VS Code Local text-context contract

Status: source research only; proposed implementation contract, not implemented or host-qualified. Planning/context-engineering skills read. Parent owns architecture and implementation. Only this research file changed.

## Evidence references

Pi root = `/home/loidinh/WS/pi-advisor/`; references below are exact local files/lines, not claims of native VS Code behavior.
- **T**: [src/config/types.ts:1–21,50–55,68–118](/home/loidinh/WS/pi-advisor/src/config/types.ts#L1): constants, portable option names and policy enums.
- **S**: [src/config/state.ts:25–77](/home/loidinh/WS/pi-advisor/src/config/state.ts#L25): initialized defaults.
- **P**: [docs/privacy.md:9–25,29–42,46–56](/home/loidinh/WS/pi-advisor/docs/privacy.md#L9): disclosure semantics, limitations, handoff and rules.
- **C**: [src/tools/consult-context.ts:38–41,86–166](/home/loidinh/WS/pi-advisor/src/tools/consult-context.ts#L38): shared context budget, draft and attachment accounting.
- **M**: [src/tools/prompts.ts:26–75,78–121,177–185](/home/loidinh/WS/pi-advisor/src/tools/prompts.ts#L26): origin labels, escaped regions, Git half-budget and status notices.
- **A**: [src/attachments.ts:9–10,38–48,69–149,153–199](/home/loidinh/WS/pi-advisor/src/attachments.ts#L9): file caps, exact membership, regular-file checks and reading.
- **R**: [src/preferences.ts:10,26–99,102–144](/home/loidinh/WS/pi-advisor/src/preferences.ts#L10): preference/rules caps, trust, symlink and inode checks.
- **G**: [src/git.ts:6–27,53–74,77–102,105–187](/home/loidinh/WS/pi-advisor/src/git.ts#L6): ceilings, escaping, deadline, Git commands; current collector does not explicitly disable external diff/textconv or optional locks.
- **D**: [src/redaction.ts:3–18,20–52](/home/loidinh/WS/pi-advisor/src/redaction.ts#L3): common-pattern redaction before UTF-8 byte capping.
- **H**: [src/tools/register-ask-advisor.ts:55–80,114–130](/home/loidinh/WS/pi-advisor/src/tools/register-ask-advisor.ts#L55): invocation fields and prior-response, consume-once tracked-file handoff.
- **I**: [src/tools/model-access.ts:42–52](/home/loidinh/WS/pi-advisor/src/tools/model-access.ts#L42): same-model protection depends on actual Pi executor identity.
- **L**: [installed Pi bundle chunk-BK6FEHYX.js:9](/home/loidinh/WS/pi-advisor/node_modules/@earendil-works/pi-coding-agent/dist/bundle/chunks/chunk-BK6FEHYX.js#L9): imported text limits `DEFAULT_MAX_LINES=2e3`, `DEFAULT_MAX_BYTES=51200`; this installed dependency, not a universal version promise.
- **B**: [planning-brief.md:7–15,31–39](../planning-brief.md#L7): independent extension, explicit handoff approved, redaction ON approved, planning/native-qualification boundary.

## Policy/default matrix

“Verified Pi” describes inspected source; “adaptation” is a recommendation unless B explicitly approves it. Characters below mean JavaScript UTF-16 code units, not bytes or model tokens.

| Field/policy | Verified Pi value/units | VS Code text adaptation |
|---|---|---|
| `contextMaxChars` | 15,000 chars; maximum `Number.MAX_SAFE_INTEGER` (T:13–14) | Same default; user/global validated nonnegative integer with bounded extension maximum; shared explicit context + rendered Git payload, not whole-request total |
| `advisorGitContext` | `summary`; enum `off/summary/full` (S:70; G:6) | Same ceiling; tool `none/summary/full`, map `none→off`; absent request uses ceiling; never widen |
| `advisorGitContextMaxChars` | 20,000 chars (T:21) | Git budget `min(setting,floor(contextMaxChars/2))`; default effective maximum 7,500 chars (M:78–82) |
| `advisorRedactSecrets` | `false` (S:69; P:29) | **true**, approved deviation (B:15); applies to every outbound text source and focus question |
| `advisorTrackedFileContent` / `advisorUntrackedContent` | Both `false` (S:74–75) | Same; separate affirmative user/global permissions; no implicit consent from tool arguments |
| Text attachments | 8,192 bytes/file; combined tracked+untracked 24,576 bytes (A:9–10; C:150–165) | Same post-redaction UTF-8 payload caps; exact paths only, no sibling expansion |
| `draft` | Optional; 8,192 bytes after redaction (C:143–149) | Same; unverified executor claim, never test/verification proof |
| `advisorAgentsMdContext` | `true` (S:29); root + global rules 8,192 bytes/source, 16,384 bytes combined (R:118–143) | Preserve toggle/caps; project root `AGENTS.md`; explicit user-selected global source, no silently inherited Pi global directory |
| Preferences | Trusted `.pi/advisor-preferences.md`, 8,192 bytes (R:10,102–115) | Optional fixed extension-specific root file; source mapping requires parent decision; never write it automatically |
| `advisorToolPolicies` | `{}`; exact name `full/summary/exclude`; unspecified tool → `full` (S:72; T:50–55; P:30–34) | **Unavailable** without transcript/tool-result access; do not expose a cosmetic no-op privacy setting |
| Historical tool-result caps | 2,000 lines / 51,200 bytes per result (T:1–20; S:67–68; L:9) | Inventory only; not a cap on explicit `context` or proof of hidden tool-policy enforcement |
| History/Scout/images/follow-up cache | Pi host reconstruction, optional Scout, pixels, cached `followUpTo` (P:17–19,38–42,48; C:113–130,167–218) | Not supplied by text-handoff contract; reject image/history/follow-up arguments, no transcript scraping or persistent prefix cache |
| Tracked one-shot handoff | Prior advisor must name every path; permit consumed once (H:114–130) | Not automatically portable; proposed fresh-call exact-path disclosure under user consent is a documented deviation, not parity |
| Same-model disable | `true` (S:39); compares actual executor provider/id (I:42–52) | Parent model unavailable: independence **unknown**; cannot claim this guard is enforced |

Git `summary` sends changed paths/status/counts, no patches or hunk headers. `full` adds tracked patch against HEAD, covering staged+unstaged changes. Untracked bodies never come from Git, even at `full` (P:9–24; G:138–169). Names themselves disclose information. `full` can disclose tracked content independently of attachment flags; turning tracked attachments off does not prohibit patches.

## Proposed input contract — one complete, explicit request

Tool JSON object: `{ context: string, question?: string, draft?: string, gitContext?: "none"|"summary"|"full", includeTrackedFiles?: string[], includeUntracked?: string[] }`. Unknown keys rejected. `context` required and nonblank; never advertise Pi's empty-object contextual review when no host history exists.
- `context`: concise user goal, constraints, current decision/state, relevant permitted observations, actual validation performed and remaining uncertainty. Missing observations stay unknown. Tool performs no transcript reconstruction, source-tool lookup or evidence authentication.
- `question`: optional targeted focus; omitted means review supplied context. `draft`: optional proposed work/claim, clearly distinct from observations.
- Arrays: exact repository-relative literal paths, deduplicated; maximum 16 distinct attachments combined, 1,024 UTF-8 bytes/path; no globs or directories. Same canonical file cannot consume two separate budgets.
- Explicit text is **disclosure**, including pasted tool outputs, patches and file bodies. It cannot inherit hidden source-tool policies or prove compliance with Git/file restrictions. Immutable description must warn against copying excluded output/secrets/withheld bodies; provenance labels do not make this enforceable.
- Recommended one-shot semantics: only this explicit call can read the requested files; permissions never trigger automatic collection, advisor-directed second calls, cached reuse or retries. Global flags authorize the disclosure class; executor-named paths alone are not user consent. Preserve Pi's prior-response gate instead only if parent explicitly chooses to implement a real local permit state machine.

## Proposed budget and assembly algorithm

Additional constants below are **proposals**, not Pi defaults: raw per-source ceiling 262,144 UTF-16 units **and** 1,048,576 UTF-8 bytes; aggregate raw ceiling 1,048,576 units **and** 4,194,304 bytes; serialized whole-request ceiling 131,072 UTF-8 bytes. Applies to explicit strings and read text; bound labels/paths/counts too. Exceeding either raw dimension rejects/withholds the whole offending source, never sends a raw prefix.
1. Resolve one trusted local canonical root and user/global policy snapshot before any repository/rules read. Reject invalid inputs before model dispatch. Required `context` is redacted before capping; if no meaningful context survives, return `EMPTY_CONTEXT`.
2. Read bounded **complete** regular text sources (size bound plus bounded read and post-open identity/size checks). If a file is larger/grows beyond the raw ceiling, withhold it entirely. Do not copy Pi's cap-plus-one-byte prefix reading as a guarantee against a secret spanning the unread boundary (A:135–141; R:89–93).
3. Redact complete accepted text first, including question, draft, paths, rule-origin labels, preferences and Git payload; escape delimiters second. Cap per-source redacted text with UTF-8-safe truncation and explicit notices. Redaction is common-pattern risk reduction, not classification or a secrecy guarantee (P:5; D:34–52).
4. Git region <= half shared character budget. Escaped explicit context receives remaining shared chars; preserve core task/decision, remove lower-priority tail first and report truncation. Cap rendered regions, not raw text alone: escaping may expand length. Never split a surrogate pair, UTF-8 sequence or encoded delimiter.
5. Outside the shared character budget: question <=8,192 bytes (proposed), draft <=8,192, files <=24,576, rules <=16,384, preferences <=8,192. Do not imply Pi's 15,000 chars bounds all these extra regions (C:107–166).
6. Assemble separately origin-labelled untrusted context/Git/files/rules/preferences/draft/focus regions; local trusted system instruction says supplied claims are not verified, no pixels/history are available, and uncertainty/withheld data must be acknowledged. Escape all interpolated regions; never let text close a region or change system instructions (M:26–75).
7. Measure full serialized system+messages+labels+notices against whole-request UTF-8 ceiling and model `maxInputTokens` via supported host counting API. Byte limit is not token assurance. Remove optional preferences, global then project rules, attachment tails, Git tails, draft tails, context tails in that order; keep required focus, minimal context and disclosure metadata. Re-render each valid region; never slice serialized output. If minimum request still cannot fit, `CONTEXT_TOO_LARGE`, zero dispatch.
8. Recheck trust, canonical root and policy just before dispatch. A changed snapshot means `POLICY_CHANGED`, no request; caller must explicitly invoke again. No raw payload in logs, telemetry, persisted state or errors.

## User/global ceilings and local collection safety

All disclosure-affecting configuration is user/global-only: Git ceiling/caps, context caps, redaction, file permissions, rules toggle/source and preferences source. Resolve explicit global values/defaults using configuration inspection, **not** the merged effective workspace value; ignore/report workspace and workspace-folder overrides. Tool args may narrow Git but never widen flags/caps or turn off redaction. Reject malformed settings; do not coerce strings/NaN/negative values into broader disclosure.
- Initial recommendation: trusted `file:` workspace, exactly one admitted root; no remote/virtual/untitled/no-workspace/multi-root inference. Root selection extensions require parent approval; agent-supplied absolute workspace roots are not authority.
- Canonical Git top-level must equal admitted canonical workspace root. Ancestor repository discovery otherwise leaks sibling names/patches. Reject nested repository/submodule attachments and root symlinks unless explicitly qualified; do not silently broaden scope to repository parent.
- Every file source: reject absolute/traversal/NUL/ambiguous separators, symlinks in **any** below-root component, nonregular files, FIFOs, binaries/images, submodules and outside-root realpaths. Check exact NUL-delimited Git membership; tracked index entries must be ordinary files. `.git` administrative contents never eligible. No ignored-untracked escape via permissive patterns.
- Open with no-follow protection where supported and compare descriptor dev/inode to validated file; validate parent chain and root before/after read. This alone does not prove parent-directory race freedom: choose a supported-platform safe reader or fail closed where containment cannot be guaranteed. Qualify race protections, never claim universal filesystem guarantees from realpath alone.
- Git: async cancellation-aware process, executable resolved under user-controlled host policy, argument arrays/no shell; sanitize inherited `GIT_*` scope/config overrides (`GIT_DIR`, `GIT_WORK_TREE`, config injection, external-diff variables). Set `GIT_OPTIONAL_LOCKS=0`; fixed `-c core.fsmonitor=false` and diff `--no-ext-diff --no-textconv --no-color`; disable pager. Use literal pathspecs, `--` and `-z` wherever paths are parsed. Never execute submodule helpers or fetch/network commands.
- Collect status/name-status + shortstat against HEAD; use empty-tree base for an unborn repository. Full adds patch only. Redact before rendering/cap. All Git/membership commands share a proposed 5,000 ms deadline and bounded aggregate raw output; failure/overflow yields `failed/timeout`, never a clean-tree assertion. Pi's existing 16 MiB subprocess buffer is an implementation bound, not an egress cap (G:79–100).
- Cancelled collection kills child work; cancelled pre-dispatch means zero model requests; cancelled streaming stops consumption and yields cancellation rather than partial successful advice. At most **one application-level** selected-model send per invocation; no automatic retries, fallback or broader-context resend. Provider-internal behavior is not an extension guarantee.

## Output and errors

Success text result carries bounded Markdown advice plus structured metadata: `status:"ok"`, selected model identifier, `independence:"unknown"`, `attempts:1`, Git requested/effective/status, source origin/kind and collected/withheld/truncated reasons, cap counters and warnings. No raw withheld content/unsafe path detail. Proposed response ceiling 32,768 UTF-8 bytes; stop consumption at limit and mark incomplete/truncated, never label partial response complete. No automatic executor action or gate enforcement.
- Optional executor model hint is an unverified claim, not host identity; equality may warn but inequality cannot establish independence. Do not ship a supposedly enforced `advisorDisableSameModel` toggle without actual trusted parent identity.
- Pre-dispatch errors (`attempts:0`): `INVALID_INPUT`, `EMPTY_CONTEXT`, `INVALID_POLICY`, `UNTRUSTED_WORKSPACE`, `UNSUPPORTED_ROOT`, `UNSAFE_PATH`, `CONTEXT_TOO_LARGE`, `REDACTION_FAILED`, `POLICY_CHANGED`, `MODEL_UNAVAILABLE`, `CONSENT_DENIED`, `CANCELLED`.
- Once send starts: `PROVIDER_ERROR`, `CANCELLED`, `RESPONSE_TOO_LARGE`; preserve attempt count and uncertainty, never retry automatically. Request-preparation errors send nothing.
- Optional Git/rules/file collection failure can return a withheld-source notice and continue with sufficient explicit context; invalid/unsafe **explicit requested paths** fail preparation. Git statuses distinguish `disabled`, `limited`, `not-a-repository`, `no-changes`, `collected`, `failed`, `timeout`; only successful complete collection can claim `no-changes`.

## Future security acceptance — not executed here

| Scenario | Observable go/no-go |
|---|---|
| Workspace settings set full/enable files/disable redaction | Effective user ceiling unchanged; no forbidden bytes in captured application request |
| Git off + requested full; summary contains credential in hunk header | Zero Git disclosure at off; summary has names/counts only and narrowing notice |
| Secret straddles cap/read boundary; multibyte and escaping expansion | Complete bounded source redacted before caps, or whole source withheld; valid serialized output within both budgets |
| Ancestor repo, sibling patch, injected `GIT_DIR/WORK_TREE/config`, nested repo | Unsupported root/refused source; no sibling disclosure or redirected collection |
| Malicious external diff/textconv/fsmonitor/pager executable | No helper execution; fixed argv and sanitized environment observed |
| Absolute/traversal/symlink-chain/FIFO/submodule/racing rename | Zero forbidden read/disclosure; fail closed if safe containment cannot be established |
| Crafted paths/XML closers/rule prompt injection | Data stays escaped inside origin-labelled regions; cannot create system content |
| Many sources/excess aggregate raw or serialized/token limits | Bounded reads; deterministic withholding/error; mandatory notices preserved; no invalid truncation |
| Trust/root/policy changes during collection, cancellation at every stage | Zero dispatch after detected change/pre-send cancel; child work stopped; no automatic resend |
| Tool-excluded output pasted in context | Description identifies explicit disclosure; no false claim that hidden source policy filters it |
| Images/empty context/followUpTo; unknown executor model | Explicit unsupported/invalid result; no visual/history/independence claim |
| Provider error, quota denial, response overflow | One application send maximum; actionable bounded error, no fallback or partial-success claim |

Go only after parent resolves below choices and authenticated native-host capture demonstrates the declared ceilings, cancellation, consent and single-send behavior. Current signal: exact source reads only; **no build/lint/test/format, native model invocation or security qualification**. Mandatory planning Advisor consultation reviewed proposed boundaries; its cautions about ancestor Git scope, aggregate budgets and provider-vs-application retry guarantees are incorporated; consultation is not runtime evidence.

## Unresolved parent/user decisions

1. Approve proposed hard/raw/whole-request/question/response limits and supported single-local-root boundary; widening needs explicit consent and qualification.
2. Rules mapping: recommended root `AGENTS.md` + optional user-global selected file (unset by default); alternative opt-in Pi global path. Preferences: extension-specific root file vs explicit opt-in existing `.pi/advisor-preferences.md`; no accidental dual reads. These mappings deviate from Pi source discovery and must be documented.
3. Tracked attachments: recommended user-consented exact paths on each fresh call vs real Pi-style prior-advice consume-once permit. Current text contract has no automatic prior-response authorization; do not market parity.
4. Safe-reader supported-platform strategy and real model token counting API must be qualified; unavailable required safety/counting → preparation refusal, not plausible fallback. True same-model enforcement remains unavailable without trusted executor identity.
