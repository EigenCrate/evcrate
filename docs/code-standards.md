# Code Standards and Codebase Structure

**Status:** Current implementation standards for the EVCrate core package; former plugin-specific guidance below is historical.
**Updated:** 2026-10-06
**Applies to:** TypeScript control plane, core advisor controller, canonical harness resources, generated projections, and publication tooling.
**Windows release boundary:** Qualification covers only standalone installer lifecycle and clean-install `version --json`.
Native Windows advisor Phases 01–04 are complete: Phase 03 observed OMP `ADVICE_READY`; Phase 04 qualified OMP/Codex diagnostics, while Claude/Pi remain unverified. This does not establish broad Windows runtime parity or authorize production release.

**Plugin architecture:** DamHopper's former plugin runtime, SDK, and host integration were retired 2026-10-02. VS Code Local native support is an isolated Agent Plugins 1.0 bundle (`evcrate-local`) registered via user-controlled `chat.pluginLocations`, completely distinct from the retired DamHopper plugin and VSIX distribution.
**Linting standard:** Package script `npm run lint` is currently an echo-only check (`echo "Linting passed"`). Code standards and invariants are enforced deterministically via TypeScript compiler checks (`tsc`), runtime closure checks, and the automated test suite.
This document states implementation rules. The [system architecture](./system-architecture.md)
is the detailed contract authority; the [codebase summary](./codebase-summary.md)
is the navigation map.

## Governing principles

- **Correctness before optimization.** Prefer explicit validation and predictable
  failure over clever or speculative behavior.
- **YAGNI, KISS, and DRY.** Add only the boundary required by a contract. Reuse one
  parser, path policy, hash policy, lock protocol, and error serializer per boundary.
- **Fail closed.** Invalid input, ambiguous ownership, unsafe paths, changed
  identities, malformed journals, and uncertain cleanup stop the operation.
- **Single authority.** Canonical resources are authored once. Generated projections,
  generated inventory, manifests, and publication state are never hand-edited.
- **Bounded work.** Every file read, JSON document, path, process stream, process
  lifetime, workspace, and metadata record has an explicit limit.
- **Explicit ownership.** User-owned advisor policy and unmanaged HOME data are
  preserved; EVCrate only mutates declared managed roots.


### Enforceable architectural bans

The following patterns are strictly prohibited across the codebase:
- **No project-local controller**: The advisor controller closure (`.evcrate/bin`) is strictly HOME-owned (`<home>/.evcrate/bin`). Never materialize a controller under a project directory.
- **No reverse lock acquisition**: In project publication, the HOME publication lock is always acquired first, held through shared commit and project harness application, and released last. The project workspace lock is acquired second. Reverse lock acquisition or premature release is banned.
- **No arbitrary body rewrite**: Installed wrappers are neutral. Never perform global or arbitrary text rewrites on wrapper code. Only schema-validated command registration fields may be transformed for HOME materialization (e.g. Antigravity mapping into `.gemini/config`).
- **No ancestor project search or cwd child resolution**: Installed wrappers must locate child resources relative to their own installation root (`import.meta.url` / `__dirname`). Never traverse parent directories hoping to find an ancestor project root, and never use `process.cwd()` to resolve EVCrate internal child resources.
- **No cross-volume atomicity fiction**: Per-volume atomic renaming is the attainable filesystem boundary. Cross-volume project publication explicitly admits and manages partial completion. Never attempt cross-volume rollback of committed shared HOME state.
- **No hand edits to generated files**: Never edit generated target projections, build manifests, registries, or runtime brief artifacts directly. Modify canonical sources and regenerate through established scripts.
- **No cross-scope recovery search**: Recovery must never cross the requested scope boundary. HOME recovery never mutates project files; project recovery never searches or mutates HOME state.
- **No direct POSIX controller execution fallback**: The approved Phase 01 target contract requires every maintained advisor caller to launch supported Node (`>=22.19.0`) with the absolute HOME-owned controller script as `argv[0]`, exact UTF-8 JSON on stdin, and canonical project cwd (`packageRoot` for health diagnostics). Direct POSIX execution, shebang retry, `.cmd` shim, or shell fallback after Node launch failure is banned. Baseline direct-exec sites remain for Phase 02 migration; their presence is not completed compliance.
- **No full mentoring load or controller consultation in off mode**: Callers must resolve activation mode via `evcrate-advice-mode` before loading `advisor-mentoring.md`. Off mode strictly forbids reading mentoring instructions through navigation, loops, or fallback prompts, and never invokes `evcrate-advisor` (no get, no locks).
- **No synthetic flag appending or handoff replay**: Routers and delegators must use structured direct handoffs (`kind: "pre-run"` or `"same-run"`) built for the exact current call only. User-entered commands always use `handoff: null`; appending fake or synthetic `--advice` flags or replaying prior handoffs is banned.
- **No historical state mutation or off-mode state get during progress inspection**: Progress reconciliation via `plan-progress.md` in `off` mode never invokes `evcrate-advisor` (dependency basis is immutable in-repo receipts + sealed-path metadata, reported `receipt-attested; controller not consulted`; identified unreceipted runs pause same/overlapping scope only). Only `explicit` and `inherited` modes use identified `state get`, and progress inspection never invokes `init`, checkpoint reservations, claims, consultation, disposition, outcome, or completion.
- **No legacy command or agent naming in maintained sources**: All commands strictly project `evc-cmd-*` (nested with `-x-`, length <= 64), custom agents project `evc-*`, and Copilot skills project `evc-<skill>`. Never emit legacy shapes (`cmd_`, colons, underscores).
- **Single AGENTS.md authoring authority**: Canonical instructions are authored strictly at `.evcrate/source/.claude/AGENTS.md`. Never author in root `AGENTS.md` (generated Codex output) or create repository-owned files named `CLAUDE.md`.
- **Branch topology and release qualification**: Canonical release branches are `main` (stable) and `next` (prerelease `rc`). Stable publication always requires live, candidate-bound GitHub authorization; caller-authored approval files and environment flags cannot grant authorization.

### Stable-release authorization

- Configure `production` before stable publication: required human User reviewers with repository maintain/admin roles, prevent self-review, disable administrator bypass, and allow only the selected `main` branch (no tag policies or wildcards).
- The publisher checks the live environment and branch-policy APIs, then verifies the candidate's canonical repository, source commit, release workflow path, run ID, and attempt against GitHub.
- The workflow run's production review history must contain an approved review by a configured maintainer/admin distinct from both the actor and triggering actor. Record the actual reviewer and source API, not the initiating actor or a fabricated review timestamp.
- Stable publication requires `GITHUB_TOKEN` or `GH_TOKEN` with access to run/review history, environment protections, branch policies, and collaborator permissions. API errors or unsupported protection shapes fail closed.
- Review history cannot bind approvals to rerun attempts; stable reruns require a new workflow run. Offline stable publication is not supported. Prerelease publication does not require production approval.
- `--approval`, `--approval-evidence`, `--require-approval`, and local approval-path/requirement environment variables are removed. Candidate receipt and asset-hash verification remain mandatory.
- Live setup verified 2026-10-10: `production` reviewers `loidinhm31` and `quochuy-vo`, self-review prevented, admin bypass disabled, selected deployment branch `main`. The publisher rechecks these protections rather than trusting this documentation.
- API contracts: [environment protections](https://docs.github.com/en/rest/deployments/environments) and [workflow review history](https://docs.github.com/en/rest/actions/workflow-runs#get-the-review-history-for-a-workflow-run).

## Repository structure and ownership

```text
.
├── .evcrate/source/.claude/       canonical harness resources
├── .evcrate/source/.evcrate/bin/  shared advisor-controller source
├── .evcrate/source/{.claude-projection,.agents/skills,.codex,.antigravity,.pi,.omp,.copilot}/
│                                  generated target projections
├── .evcrate/targets/              schema-2 target manifests and overlays
├── .evcrate/registry.json         schema-1 canonical resource registry
├── .evcrate/scopes/               package-local scope state
├── src/                           TypeScript control plane
├── scripts/                       inventory, manifest, and release tooling
├── tests/                         focused contract suites
├── dist/                          compiled JavaScript/declarations
├── package.json                   package metadata and scripts
├── README.md                      concise package entry point
└── docs/                          maintained project documentation
```

`distribution/` and `pi_adapter/` are not active runtime modules in the current
scoped repository inventory. Do not describe them as alternate engines. The current
package path is TypeScript; source retains compatibility-engine types for transition
and validation boundaries, but no root `distribute.py` command is canonical.
Persisted adapter IDs are `claude`, `codex`, `antigravity`, `pi`, `omp`, `copilot`,
and `vscode`. Standalone Gemini is retired. Codex owns only `.agents/skills`;
Antigravity owns exact hook/rule leaves within that shared parent. Claude local
output `.claude-projection` never replaces canonical `.claude/AGENTS.md`.

### Scout-block ignore policy

The canonical `.evcrate/source/.claude/.evcrateignore` and
the scout-block matcher fallback defaults are one policy: keep the
same twelve heavy-directory entries, ordering, and comments. Standard entries
use trailing `/`: `node_modules/`, `dist/`, `build/`, `.next/`, `.nuxt/`,
`__pycache__/`, `.venv/`, `venv/`, `vendor/`, `target/`, `.git/`, and
`coverage/`.

Trailing `/` is normative directory-only syntax. It blocks root or nested
directory operands and descendants (`build/`, `apps/web/build/out.js`) but does
not block a bare lexical command token (`build`) or safe near-matches such as
`src/build-tools.js`. Preserve legacy custom bare-name patterns and ordered
negation behavior. Do not add `!dist`/`!build` command workarounds, infer file
types from the working tree, or hand-edit generated projections.

The canonical Claude resources are the only authored hook source. Regenerate the
current target projections and require `npm run distribute:check` before publication.
Include VS Code Local and native nested instruction/hook/rule leaves. Companion
directories are ownership boundaries, never additional adapter IDs.
Projected and published OMP runtime behavior must retain the same allow/block
boundary.

## TypeScript and npm standards

### Package and entrypoints

- Keep the package CommonJS-compatible and compile strict NodeNext TypeScript from
  `src/` to `dist/` with declarations.
- Retain both bins: `evcrate` for the one-shot control-plane CLI and
  `evcrate-advisor` for the existing CommonJS controller.
- Keep public exports side-effect free. Importing `src/index.ts` must not start a
  process, open a listener, mutate HOME, or run a distribution action.
- Treat `package.json` scripts as command authority:
  - `npm run build`: Incremental TypeScript compilation via `node scripts/build-typescript.mjs -p tsconfig.json`.
  - `npm run prebuild:clean`: Shares ordinary prebuild lifecycle (`npm run prebuild`), regenerating the runtime brief, advisor runtime, and controller inventory before clean builds.
  - `npm run build:clean`: Clean build invalidating build info cache (`.tsbuildinfo`) while retaining prior receipt via `node scripts/build-typescript.mjs -p tsconfig.json --clean`.
  - `npm run generate:advisor-runtime`: Incremental advisor runtime build via `node scripts/build-typescript.mjs -p tsconfig.advisor-runtime.json`.
  - `npm run generate:all`: Orchestrated sequence: `npm run build && npm run generate:registry && npm run generate:manifests`.
  - `npm run distribute:build`, `npm run distribute:check`, and target-specific `npm run distribute:*` scripts for target projections.

### TypeScript incremental build caching and receipt safety

TypeScript builds enforce deterministic incremental caching with compiler-owned output tracking:
- **Cache configuration & layout**: `tsconfig.json` and `tsconfig.advisor-runtime.json` configure `"incremental": true` with build info caches in `.cache/evcrate/` (`tsconfig.tsbuildinfo` and `tsconfig.advisor-runtime.tsbuildinfo`). The `.cache/` root is gitignored (`/.cache/`).
- **Authoritative compiler driver**: `scripts/build-typescript.mjs` orchestrates compilation:
  - Exposes `buildTypeScript(options)` and CLI flags `-p`/`--project <config>` and `--clean`.
  - Resolves outputs and caches via public TypeScript compiler APIs (`ts.readConfigFile`, `ts.parseJsonConfigFileContent`, `ts.createProgram`, `ts.getOutputFileNames`).
  - Spawns `node_modules/typescript/bin/tsc` via `spawnSync` with `-p <absoluteConfigPath>`.
  - Non-zero compiler exits halt driver cleanup and receipt updates; compiler emission still follows TypeScript's `noEmitOnError` policy.
  - **Clean mode semantics**: `--clean` removes only the `.tsbuildinfo` file to force complete compilation. The prior receipt is preserved so `cleanStaleOutputs` can diff against prior ownership.
  - **Effective CLI flags & noEmit**: CLI arguments are parsed with `ts.parseCommandLine` relative to the compiler working directory (`outDir`, `rootDir`, `declarationDir`, `tsBuildInfoFile`, `baseUrl`). For `--noEmit` (typecheck-only) runs, expected output inventory is empty, cache validation skips missing outputs, and `buildTypeScript` skips emitting-build stale output cleanup and receipt mutation entirely.
  - **Output override receipt partitioning**: When CLI flags override `outDir` or `declarationDir`, `receiptPath` appends a 16-hex SHA-256 partition hash (`<receiptPath>.<identity>`) to prevent cross-configuration receipt collisions.
- **Cache validation and invalidation**: `scripts/typescript-build-cache.mjs` ensures build soundness:
  - **Program closure inventory**: `resolveConfigOutputs` uses `ts.createProgram` to resolve the full emit-eligible program closure (`!source.isDeclarationFile && !program.isSourceFileFromExternalLibrary(source)`), capturing both root and imported non-root modules. Output filenames are computed via `ts.getOutputFileNames`. Live imported module outputs are fully tracked and never deleted as stale.
  - **Corruption recovery**: `isBuildInfoCorrupt` detects empty or malformed JSON `.tsbuildinfo` files and purges them.
  - **Missing output recovery**: `validateAndInvalidateCache` checks disk presence for all expected `.js` and `.d.ts` outputs (skipped under `noEmit`). If any artifact is absent or deleted, the `.tsbuildinfo` file is unlinked, forcing full compiler re-emission.
- **Receipt management and safe stale cleanup**: `scripts/typescript-build-receipt.mjs` tracks compiler-owned outputs in schema version 1 receipts (`<tsBuildInfoPath>.receipt.json`):
  - **Safe stale cleanup**: `cleanStaleOutputs` diffs current expected outputs against the prior receipt to remove obsolete outputs from renamed or deleted source files.
  - **Separate declaration directory**: Supports distinct `declarationDir`, tracking declaration artifacts alongside code outputs and recording `declarationDir` in receipt metadata.
  - **Physical all-ancestor containment & symlink refusal**: `isSafeOutputPath` inspects every path component from the filesystem root through output root ancestors, parent directories, and leaves via `fs.lstatSync`. Symbolic links in ancestors, parent directories, or output leaves are strictly refused (never unlinked or followed). Confirms physical containment of parent directory inside real output root via `fs.realpathSync`.
  - **No directory sweeping**: Never sweeps `outDir` or unlinks unrecorded files.
  - **Failed cleanup ledger preservation**: If stale output cleanup encounters errors, `buildTypeScript` halts with exit status 1 without calling `writeReceipt`, preserving the prior receipt on disk for subsequent runs.
  - **Atomic persistence**: On successful cleanup, `writeReceipt` records `{ version: 1, config, outDir, declarationDir, timestamp, outputs }` using a `.tmp.<timestamp>` file and atomic `fs.renameSync`.
### One-shot CLI lifecycle

```text
parse arguments/request file
        ↓
resolve immutable package/project/home/target context
        ↓
dispatch exactly one operation
        ↓
validate and write exactly one result
        ↓
exit
```

The CLI supports version, health, `resources list|get`, `imports preview|apply`,
`scopes list|get|assign|remove|enable|disable`, `changes preview|apply`,
advisor-settings `get|preview|apply`, and distribution `build|check|publish|all|recover`.
A request file is one complete bounded versioned envelope and is mutually exclusive
with positional command construction. JSON and non-TTY output derive from the same
validated result.

Do not add a daemon, listener, generic/unbounded retry loop, background worker,
arbitrary launcher, or direct migrator dispatch. The managed v2 advisor controller
is the explicit retry exception: Phase 05 permits up to four sequential primary
launches with cancellable 10/20/30-second backoff, followed by one configured
backup; no other CLI operation retries. Compatibility paths must be explicit and
transition-only; they must not mix Python and TypeScript mutations in one atomic
operation. Unknown failures become stable sanitized errors; raw paths, child
stderr, credentials, and stack traces do not cross the public boundary.

### Naming and module design

- Files and directories use descriptive kebab-case.
- Functions and variables use `camelCase`; classes and types use uppercase-leading
  names; constants use uppercase snake case.
- Keep modules focused. Prefer existing boundaries over new registries, service
  containers, aliases, or parallel conventions.
- Use immutable interfaces (`readonly` fields, frozen result objects) at protocol,
  manifest, context, and transaction boundaries.
- Exported functions have explicit return types and exhaustive result branches.
- Comments explain security rationale or non-obvious invariants, not syntax.

## Normative command and resource naming

All documentation and target-facing examples use unified `evc-cmd-*` naming for
slash commands and `evc-*` naming for agents. The single authority is
`src/adapters/resource-naming.ts`, enforced canonically by
`.evcrate/source/.claude/scripts/scan_commands.py`:

- Canonical command source files are flat files under `.evcrate/source/.claude/commands/evc-cmd-*.md`.
- Root forms are `/evc-cmd-plan`, `/evc-cmd-code`, `/evc-cmd-cook`, `/evc-cmd-fix`, and `/evc-cmd-advise`.
- Nested resources use the reserved segment separator `-x-`, for example
  `/evc-cmd-fix-x-hard` and `/evc-cmd-review-x-codebase`. No segment may contain an isolated `x` token.
- Agents use `/evc-*` (e.g., `evc-advisor`, `evc-code-reviewer`, `evc-planner`).
- Copilot projects user-invocable skills as `evc-cmd-*` (with raw `$ARGUMENTS`) and styles as `evc-style-*`.
- Semantic identities (e.g. `code/auto`) join segments with `/` and remain the stable key for advisor activation allowlists.
- All seven active target projection adapters emit flat `evc-*` names without compatibility aliases.
- Shell executable syntax (`npm`, `node`, `python3`, `cp`, `export`) is executable shell syntax, not slash resource names.
## Protocol and JSON standards

Use repository parsers rather than permissive ad-hoc parsing at a control-plane
boundary. Contracts enforce, as applicable:

- fatal UTF-8 decoding and bounded documents;
- object/array roots where required, never primitive protocol roots;
- duplicate-key, control-character, trailing-data, non-finite-number, and depth
  checks;
- unpaired-surrogate rejection and plain objects/arrays only;
- exact-key validation for frozen wire shapes;
- canonical JSON ordering and SHA-256 digesting.

Validate before dispatch. Reject unknown fields, duplicate semantic paths,
credentials, counsel-shaped fields, control characters, unsafe metadata paths,
overlong values, traversal, symlinked ancestors, special entries, and invalid
ownership. Use stable control-plane error codes and established exit mapping. Never
return secrets, policy credentials, raw child output, raw filesystem implementation
paths, or stack traces.
### Control-plane error taxonomy

`ControlPlaneErrorCategory` is the stable public classification. Exit codes are
grouped by category:

| Category | Exit code | Typical boundary |
|---|---:|---|
| `success` | 0 | Operation completed successfully. |
| `usage`, `protocol` | 2 | CLI syntax or versioned request shape is invalid. |
| `validation`, `path`, `capability` | 3 | Input, path, or requested capability is unsupported. |
| `conflict` | 4 | A revision or ownership CAS check failed. |
| `publication`, `rollback`, `recovery` | 5 | Publication transaction or recovery failed. |
| `internal` | 6 | Unexpected failure; expose only the sanitized diagnostic. |

Keep this mapping in `src/errors/control-plane-error.ts`; do not invent
operation-specific exit codes at individual call sites.

## Manifest, registry, and resource standards

### Target manifests

The schema-2 target registry persists exactly `antigravity`, `claude`, `codex`,
`copilot`, `omp`, `pi`, and `vscode`. `agy` is input-only normalization for
`antigravity`. Manifests declare exactly the resource roots `skill`, `agent`,
`workflow`, `command`, and `hook`, plus target output/home policy. Normalize paths;
reject traversal, backslashes, duplicate lists, symlinked ancestors, equal/nested
output roots, unsafe adapter/helper files, and obsolete per-harness controller
fields.
Nested project documents are closed exact declarations: Copilot
`.github/copilot-instructions.md`; Antigravity `.agents/hooks.json` and
`.agents/rules/evcrate-antigravity.md`. Do not authorize either parent as a
replaceable root; preserve user sibling contents and reject unmanaged leaf collisions.

Patch authorization is explicit: a source must be a regular file under the manifest
patch subtree; destination must be normalized, unique, and inside a declared output
root; keys must be non-empty, unique strict dotted JSON keys; patch text must be
valid JSON.

### Resource registry and imports

Keep resource registries distinct from schema-2 target/build manifests. Validate
historical schema-1 and complete old eight-target schema-2 resource documents
before read-only normalization; remove retired Gemini and add VS Code only for
schema 1. Current writes persist seven targets with original-byte CAS.
Registry records use stable `kind:canonical-relative-path` IDs, canonical source paths,
file-versus-tree domain-separated content hashes, provenance, compatibility entries,
capabilities, bounded optional metadata, and positive revisions. IDs and records sort
by Unicode code point. Permission bits are not content hashes; capability assessment
remains separate.
Canonical scans validate canonical-root and resource-root containment, reject
symlink/special entries, and hash before discovery. Resource kinds are fixed: skill
directories contain `SKILL.md`; agents/workflows are root-level Markdown files;
commands recurse for Markdown files; hooks are root-level files or directories.
Imported content is never executed.

`imports.preview` reads immutable bounded descriptors into a bounded isolated stage and
writes only a single-use replay token. `imports.apply` rechecks source identity,
canonical/registry/manifest/adapter/output hashes, destination, provenance,
approvals, expiry, and resource record before promotion. Same-provenance matches are
updates/unchanged; different provenance, kind mismatch, stale dependencies, or
unmanaged destinations return <code>CAS_CONFLICT</code> without adopting or deleting user data.

## Advisor controller standards

The controller is authored only at `.evcrate/source/.evcrate/bin/` and published
once to `$HOME/.evcrate/bin/`. Its exact 46-file generated closure includes the
36 shared/Windows entries, eight Darwin-specific assets, plus two deterministic
advice activation assets (`evcrate-advice-mode` and `lib/advisor/activation.cjs`).
The controller reads user-owned `$HOME/.evcrate/advisor-routing.json`; policy is never published.

### Explicit Node caller launch invariant

All maintained advisor callers must use explicit Node invocation:
- Executable is supported Node (`>=22.19.0`), using `process.execPath` when running under Node, or configured/available `node` on `PATH` in shell/harness callers.
- Script path is the absolute HOME-owned asset (`<home>/.evcrate/bin/evcrate-advisor` or `<home>/.evcrate/bin/evcrate-advice-mode`). The helper asset is packaged in the closure, not exposed as an npm CLI binary on PATH.
- Standard input carries exact UTF-8 request JSON, terminated by EOF.
- Working directory is canonical project cwd (`packageRoot` for health diagnostics).
- No direct POSIX execution fallback, shebang retry, `.cmd` shim, or shell fallback after launch failure.
- Shebang (`#!/usr/bin/env node`), npm `bin` mappings for CLI tools (`evcrate`, `evcrate-advisor`), and execute bits remain packaging metadata verified by closure checks; they do not authorize direct execution.

### Deterministic activation helper wire contract and error convention

The packaged CommonJS helper `evcrate-advice-mode` provides deterministic advice activation:
- **Bounded wire schema, realpath & selection paths:** Protocol `evcrate-advice-mode` v1 (stdin ≤ 64 KiB, decoded raw arguments ≤ 32 KiB, terminal output ≤ 256 KiB, 2-second input/output deadlines). CLI compares `fs.realpathSync(project_root)` to `fs.realpathSync(process.cwd())`; a symlinked logical root is accepted, while a different or unresolvable root rejects with `ADVICE_CONTEXT_MISMATCH`; original context is echoed on success. Selection paths (`plan_path`, `phase_path`) are validated by metadata and relative-POSIX safety only: reject leading `/`, `\`, `:`, controls, empty/`.`/`..` components, trailing `.` or space, characters `<` `>` `"` `|` `?` `*`, and case-insensitive device stems CON, PRN, AUX, NUL, CLOCK$, COM0–COM9, LPT0–LPT9, COM¹ COM² COM³, LPT¹ LPT² LPT³, CONIN$, CONOUT$, with or without any extension as well as device stems with optional spaces before an extension (conservative admission policy, no Windows qualification claim; names with internal spaces or merely resembling stems stay accepted); 1 KiB bound; no sensitive-name filter — artifact readers keep their own fences.
- **Supported command helper admission:** Supported OMP command entrypoints execute the HOME helper before model prompt admission; activation membership derives from the helper's exported frozen `COMMAND_NAMES` array (single authority). Other hosts follow their projected receiving contract. Plain tasks and unsupported commands must not invent a helper command identity.
- **Sole parser authority, quote spans & byte preservation:** `lib/advisor/activation.cjs` is the single parser authority (`COMMAND_NAMES`, `parseAdviceArguments`, `parseActivationRequest`, `evaluateActivation`). Never reimplement flag scanning in harness wrappers or command prompts. Arguments are parsed with strict quote-span and boundary rules:
  - Single (`'...'`) and double (`"..."`) quotes define non-evaluating spans where flags are ignored.
  - A quote opens a span only at an unescaped token boundary (start of input or after unescaped whitespace); mid-token quotes (`don't`, `café's`, `日本's`, `5" bezel`) are ordinary text (no word-character apostrophe heuristic). In boundary-less constructs such as `key="x --advice y" --advice` or `("use --advice here") --advice`, the inner flag is not inside a quote span, producing two eligible flags that fail closed with `ADVICE_MODE_DUPLICATE_FLAG` rather than silently activating.
  - Backslashes escape following characters (`\"`, `\'`, `\\`); odd backslashes escape quotes and suppress flags; escaped flags (`\--advice` or following escaped whitespace `\ `) never match.
  - Unterminated quotes suppress trailing flags (`off` mode).
  - Standalone unescaped `--advice` requires whitespace or string delimiters; two or more eligible flags reject with `ADVICE_MODE_DUPLICATE_FLAG`.
  - Exact byte preservation: Original task bytes and quotes are never stripped or shell-evaluated; only the final standalone `--advice` token and preceding whitespace are stripped when resolving `explicit` mode.
- **Structured handoffs & known phase preservation:** Pre-run (`kind: "pre-run"`, `run: null`) preserves caller-supplied `plan_path`, `phase_path`, and `phase_id`; downstream receivers may refine only unknown (`null`) selections. Continuation delegates use `kind: "same-run"` with verified binding (`task_run_id`, `project_id`, `phase_id`, and revisions), validated by lazy get against durable state; completed or abandoned runs fail closed with `ADVICE_RUN_COMPLETED`.
- **Cooperative handoff boundary & lazy mentoring:** Canonical entry/replay rule: *"A user-entered command always uses `handoff: null`. A handoff exists only when built by the router delegating this exact call; never reuse or replay one from earlier turns, commands, plans, reports or transcripts."* Handoffs and context headers are a cooperative contract, not authentication (severity MEDIUM): pre-run inheritance grants no more than a fabricated `--advice`, and capability tokens are rejected because a model could mint one via a fabricated flag while a token store, locks, and expiry add cost without closing that boundary. Mentoring instructions (`advisor-mentoring.md`) are loaded lazily only upon resolved `explicit` or `inherited` mode.
- **OMP command runtime and projection contract:**
  - Compact v2 header: `evcrate_omp_command_context` contains `protocol`, `version: 2`, `source: "native-user"`, `command`, `mode`, `reason`, exact `context`, and `run`. No duplicate `raw_arguments`, `work_arguments`, or `activation_result`; admitted work text appears once in the body. No delegated host header or separate delegated admission API exists.
  - Native-user admission & direct-definition receiving: Native `execute(args, ctx, raw?)` evaluates with `handoff: null` and emits `source: "native-user"`. Delegating directly to a command within a session or reading its definition always invokes the HOME helper with the exact child context and current-call handoff per `advice-activation.md`; callers never trust model-typed headers, reuse parent native results, or synthesize native-user headers.
  - Structural rendering: `src/adapters/omp/commands.ts` replaces the `## Advice Mode` invocation paragraph structurally (heading + first paragraph) without sentence regexes, deriving activation membership from helper `COMMAND_NAMES`.
- **HOME-only closure & fail-closed diagnostics:** Installed at `$HOME/.evcrate/bin/evcrate-advice-mode` with `lib/advisor/activation.cjs` (mandatory in every mode including `off`; no project-local binary, prompt fast path, or alternate parser). Admission diagnostics distinguish missing Node (`Node >=22.19.0 not found on PATH…`), missing helper or unreadable packaged resource (republish via `evcrate publish --apply --scope home --target omp`; if CLI unavailable, manual `./install.sh repair` or fresh `./install.sh install` from the release bundle — admission never downloads or executes installers), and helper runtime faults (`HOME activation helper failed: <reason>`, without Node wording).
- **No history-based activation & off-mode decoupling:** Historical UUIDs, receipts, or checkpoints do not activate advice mode. Off mode never invokes `evcrate-advisor` (no get, no locks); dependency reconciliation uses immutable in-repo receipts + sealed-path metadata (`receipt-attested; controller not consulted`), while explicit/inherited keep strict get/CAS/freshness/human gates.
- **Sanitized error envelope, process exit & test scope:** The helper reports failures via the four-key sanitized routing error envelope (`{ code, category, action, message }` in `lib/advisor/errors.cjs`), exiting 0 on `status: "MODE_READY"` and 1 on failure. Activation tests verify hostile-state off isolation (CLI + native), truthful `A02`/`A05`/`A14` byte/stat preservation, and dynamic `COMMAND_NAMES` entrypoints without prose pins or dead delegated cases; deterministic admission tests do not constitute live model/host authorization evidence.
- **Distinction from control-plane error taxonomy:** Helper exit codes (0 or 1) and error envelope are CommonJS advisor runtime constructs, strictly distinct from TypeScript `ControlPlaneErrorCategory` and its exit code mapping (0, 2, 3, 4, 5, 6 in `src/errors/control-plane-error.ts`).
### Darwin runtime integration (Phase 05)

- **Platform isolation:** Gate all Darwin dispatch strictly on `process.platform === 'darwin'`. Linux (procfs, kill-0, fd-pinning) and Windows (PowerShell/Job Objects) invariants remain isolated and unchanged.
- **Addon boundary:** Load the packaged Node-API 8, bridge ABI 1 addon only on Darwin `arm64`/`x64`; do not compile or download at runtime. Linux and Windows never load the addon.
- **Descriptor-relative capabilities:** Implemented across `state-io.cjs`, `state-baseline.cjs`, `history-store.cjs`, `history-query.cjs`, `history-prune.cjs`, and `isolated-workspace.cjs`. Display paths remain metadata; filesystem mutations use descriptor-relative capabilities (`openRoot`, `openDirectory`, `openRegular`, `removeOwned`). No `/proc`/`/dev/fd` fallbacks.
- **Scoped capability ownership (`owns_parent`):** `AdvisorCap` in `storage.c`, `advisor-native.c`, and `advisor-native.h` tracks `owns_parent`. Intermediate ancestor directory capabilities created during `openRoot` set `owns_parent = true` so leaf closure reaps intermediate descriptors; child capabilities derived via `openDirectory` set `owns_parent = false` to preserve caller parent lifetime.
- **Process identity and self-token verification:** Monotonic start tokens determine identity. Missing/different tokens indicate dead processes; matching tokens are conservatively live. `state-io.cjs` and `history-store.cjs` enforce non-null self-token verification before lock/recovery writes (`state.lock`, `history.lock`, `state-recovery.lock`) and pending persistence (`claimCheckpoint`).
- **Canonical identity & path aliases:** State, baseline, history, and controller audit share identical canonical project bytes. Accept only bridge-verified `/var` and `/tmp` system aliases; invalid explicit `HOME` fails closed.
- **Outstanding Cycle 3 warning:** Static review flags `owns_parent` as uninitialized for `/var` and `/tmp` intermediate capabilities, a potential descriptor leak; no macOS behavior has been tested.
- **Runtime status boundary:** Implementation present, untested/unqualified. macOS addon loading, controller/provider execution, automated tests, and CI remain prohibited.

### Native Windows advisor lifecycle and readiness repair

Native Windows advisor Phases 01–04 are complete: Phase 03 observed live OMP `ADVICE_READY`; Phase 04 qualified OMP/Codex diagnostics, while Claude/Pi remain unverified. This is implementation/diagnostic evidence, not broad Windows runtime qualification.

- `windows-platform.cjs` invokes fixed operations through the packaged PowerShell bridge; no interpolated shell text, arbitrary `.cmd` body, or caller-supplied executable.
- `windows-native.cs` assigns the provider to a non-breakaway, kill-on-close Job at process creation and captures its creation token from the launch handle.
- `runner.cjs` accepts success only after positive empty-Job confirmation; cancellation, probe timeout, output limit, transport error, or controller EOF terminate the Job. Unknown cleanup blocks success/retry; Windows `taskkill` and teardown-time PID lookup are prohibited.
- `state-human.cjs` uses verified `CONIN$`/`CONOUT$` for exact challenge observation, independent of JSON stdin; piped JSON is never human approval. Existing state replay/revision checks and POSIX process-group/`/dev/tty` paths remain unchanged.

### Portable advisor contract runtime
Phase 01 prepares an exact four-file TypeScript protocol closure boundary:

- `src/protocol/advisor-contract-runtime.ts` is the portable implementation.
  Keep it free of `node:*` imports, process/HOME/filesystem access, and crypto;
  it may use the existing protocol JSON primitives. Validators return
  deep-frozen values and throw `AdvisorContractError` with stable code/path data.
- `src/protocol/advisor-contracts.ts` owns state v1 declarations and re-exports
  the runtime; do not recreate advisor wire types or constants here.
- `src/protocol/advisor-settings.ts` is the control-plane adapter. Delegate
  shared route/wait/history/policy validation, then map runtime failures to
  `<code>SETTINGS_INVALID</code>` without leaking neutral error details.
- `src/protocol/index.ts` is the public protocol barrel and must export the
  runtime alongside existing protocol modules. Root `src/index.ts` reaches it
  transitively.

The Phase 01 boundary is source/export preparation; it does not replace the exact
36-file CJS controller closure. Preserve dated 29- and 33-file inventories as
historical evidence.
Keep valid/invalid contract fixtures and focused protocol tests synchronized with
exported validators.

### Phase 02 metrics kernel and generated CJS adapters

- `src/protocol/advisor-metrics.ts` is the single portable history-metrics
  implementation. Its pure exports are `normalizeHistoryRecord`,
  `normalizeHistoryFilter`, `filterHistoryRecords`, `nearestRankPercentile`, and
  `calculateHistoryMetrics`; callers provide `generated_at`.
- Normalize IDs before grouping. Invalid execution records do not enter a
  population. Byte-identical duplicate identities may collapse; conflicting
  copies exclude every copy and emit `DUPLICATE_IDENTITY`. Return values remain
  deeply frozen.
- Filters are the exact ten-key wire shape. `null` is unconstrained; values are
  OR-within and AND-across; positive `started_at_from`/`started_at_to` bounds are
  inclusive. Ratios and means round to six decimals and use `null` on a zero
  denominator; latency uses terminal receipt elapsed time and nearest-rank
  percentiles.
- The digest compatibility contract is not canonical JSON: validate without
  reconstruction or key sorting, preserve insertion order, hash UTF-8 bytes of
  `JSON.stringify(validatedCheckpoint)`, and emit lowercase SHA-256 hex. Node
  crypto and browser Web Crypto adapters must hash identical bytes.
- `tsconfig.advisor-runtime.json` and `npm run generate:advisor-runtime` emit
  exactly `canonical-json.js`, `json.js`, `advisor-contract-runtime.js`, and
  `advisor-metrics.js` under `lib/advisor/generated/`. Generated output is
  literal-relative CommonJS, dependency-free, and never hand-edited.
- `contracts-v2.cjs` retains Node hashing, advice parsing, state delegation,
  export names, and existing boundary mappings. `policy-schema.cjs` retains
  enabled-backend decisions, legacy inspection/migration, parse/decode exports,
  and route error codes while delegating shared validation.

Policy v2 has exact top-level keys `version`/`advisor`/`wait`/`history`.
`advisor` has distinct `primary`/`backup` route triples
(`backend`/`model`/`effort`); wait mode is `until_terminal` with warning bounds
`1000..3600000` ms; history is `1..365` days and
`1048576..1073741824` bytes. Keep the 16 KiB policy limit and strict
UTF-8/JSON, duplicate-key, credential, unknown-field, and unsafe-path checks
under the cross-platform trusted-files policy (UID/SID/0600 mode checks and SettingsMode removed). Candidate backends are `claude`, `codex`, `antigravity`, `pi`,
and `omp`; enabled backends are `claude`, `codex`, `pi`, and `omp`. Gemini and
Copilot are not controller backends.

Legacy host-v1 and single-target-v1 policy is read-only migration input. Settings
`get` may return a `migration_required` view; execution rejects legacy policy.
Use `get -> operator prepares v2 -> preview -> apply`. Preserve revisions,
single-use preview authorization, path/type checks under the trusted-files policy, byte-safe journal recovery,
and stale-token rejection. Never auto-write HOME, guess a backup, or place
credentials in policy. Settings request/result, journal, and preview schemas
remain v1 while carrying policy v2.

The v2 direct checkpoint binds task/run/checkpoint/phase identity and revisions
to bounded task, proposal, evidence, and prior fields. The v2 result requires
exactly seven body fields: `recommendation`, `rationale`, `must_fix`,
`cautions`, `assumptions`, `success_checks`, and `unresolved_questions`. The
v2 controller envelope carries bounded attempt summaries, build identity,
sanitized errors, and audit status. State/execution/outcome records are schema
v1 under the cross-platform trusted-files policy. Keep paths metadata-only; the controller does not read
arbitrary checkpoint paths.

The canonical mentor instructions are authored in
`.claude/skills/advisor-strategy/references/brief-contract.md` and generated
into the standalone `runtime-brief.generated.cjs` closure artifact. V2 prompt
packaging uses `formatMentorPrompt` with explicitly quoted checkpoint data.
For v2 checkpoints, enabled adapters pass extracted assistant text to the shared
`parseAdviceBody` parser; malformed, fenced, prose, unknown-field, or
incomplete bodies fail closed. The OMP adapter (`adapters/omp-parser.cjs`) enforces
1 MiB and 8192-line JSONL stream caps and accepts optional omp 18.7.0 `serviceTier`
and `usage.premiumRequests` fields, plus omp 18.8.x Anthropic-provider fields: assistant
`requestControls` (plain JSON object, at most 4096 serialized bytes, depth 6, 256 nodes) and
`usage.cttl` (plain object of at most 16 finite non-negative numbers). Both are optional and never
read; every other unknown key still fails closed with `PROTOCOL_INVALID`.

The compatibility v1 controller path remains one target/one attempt; v2 now
uses generated prompts, structured result normalization, and v2 identity
linkage. Phase 05 v2 execution permits up to four sequential primary launches
and one configured backup, with cancellable bounded backoff. Generation has no
generation deadline, while streams, output, termination, and adapter probes
remain bounded. Task gates and history commands are explicit managed operations,
not behavior inferred from validator presence. Runner calls still use
`shell:false`, fixed allowlisted argv/environment, stdin-only prompts, bounded
streams, detached POSIX groups, TERM/KILL cancellation, and descendant reaping.

### Sanitized history and outcome records

Phase 07 history is optional rich audit, never required task-state authority.
Keep version-1 `execution.json` and `outcome.json` records strict, sanitized,
and bounded to 128 KiB and 64 KiB respectively under the cross-platform trusted-files policy
(historical 0700/0600/owner-only requirements are superseded). Store them under
`$HOME/.evcrate/advisor-history/<project-id>/<task-run-id>/<consultation-id>/`;
Linux descriptor pinning prevents ancestor swaps. Use the shared state I/O
identity, atomic-write, and lock primitives; do not create an append-only stream or database.
Record execution as `started` before model launch, update bounded attempt facts,
then settle exactly once as <code>ADVICE_READY</code> or <code>FAILED</code>.
Terminal settlement must recheck consultation/task/checkpoint identity and the
original bytes before CAS replacement. Record outcomes only with linked
consultation/task identity, validated disposition, evidence revision, actual
changed paths, validation, result, and correction number; identical replays are
idempotent, conflicting records fail closed.

History writes must never launch another model, reset required state, or turn
usable inference into failure. Surface `audit_status: "degraded"` when optional
storage is unavailable. `history list` is metadata-only and project-scoped;
`show` sanitizes ANSI/control text; `export` requires an explicit safe,
non-existing destination and reports redaction findings; `prune` supports
dry-run/apply retention and quota cleanup, oldest terminal records first, while
protecting active or foreign-project records. Never retain credentials, hidden
reasoning, raw stderr, or raw vendor logs.

### History metrics CLI integration (Phase 04)

Keep `history metrics` read-only, current-project scoped, and unlocked. Parse one
bounded v1 request with exact keys; `project_id: null` means the invocation
project, and a supplied ID must match. Apply optional task scope before the
shared generated metrics kernel, then apply its exact ten-key filters. Do not
reimplement formulas, sorting, or duplicate handling in CommonJS.

The collector must normalize validated execution/outcome pairs, exclude invalid
execution records, preserve missing/invalid/unknown outcomes, and return bounded
relative-path diagnostics plus bytes, counts, completeness, and limitation
codes. Absolute HOME/cwd paths, raw advice, credentials, stderr, and hidden
reasoning never cross the output boundary. Return one
`evcrate-advisor-history` v1 result with `operation: "metrics"` and
`HISTORY_READY`; malformed requests remain sanitized `REQUEST_INVALID` failures.
Existing list/show/export/prune request shapes, locks, sanitization, and results
remain unchanged.


### Historical standalone browser history I/O (Phase 05; 2026-09-18)

At Phase 05 completion, the standalone explorer used explicit user-granted handles,
sorted project/task/consultation traversal, bounded reads, strict validation and
digest checks, and stale retention for incomplete work. That browser picker/reader
source has since been removed from this repository. This entry records historical
behavior, not a current I/O implementation or G4 acceptance. See the
[project changelog](./project-changelog.md) for the dated milestone record.


### Advisor Plugin domain data API (E00 and Phase 01)

`src/protocol/advisor-plugin-data-api.ts` is the TypeScript authority for
`evcrate-advisor-data` v1 and v2; `src/protocol/index.ts` is its public barrel.
Version 1 remains supported with unchanged wire semantics. Version 2 adds
cross-project history scope/query metadata; on-disk execution/outcome history
remains v1. The [contract guide](./all-project-advisor-history.md) records the
cross-repository freeze and implementation boundary.

Keep the method set exact: `history.refresh`, `history.summary`, `history.page`,
`history.detail`, `policy.readCurrent`, `evaluations.list`, `evaluations.read`,
and `evaluations.compare`. Domain params never accept actor, installation, grant,
HOME, target-path, or binding overrides; generic host context supplies
authorization.

Validators must reject unknown keys before dispatch, preserve discriminated
changed/missing/unavailable states, check UUID/SHA-256 identity and positive
safe-integer timestamps, and return frozen values. Keep the published limits
aligned: opaque IDs 128 bytes, cursors 256 bytes, history pages 500 rows,
evaluation pages 100 rows, page results 1 MiB, frames 16 MiB, controls 64 KiB,
evaluation documents 8 MiB, and compare requests 32 items.

`scripts/generate-advisor-plugin-data-schema.mjs` is the only schema-generation
authority. It writes both `evcrate-advisor-data-v1.schema.json` and
`evcrate-advisor-data-v2.schema.json`, plus `contract-manifest.json`, which
advertises supported versions 1 and 2. `--check` must pass before publication;
never hand-edit generated outputs. Keep positive/negative wire fixtures and
protocol parity suites synchronized.

V2 adds `project_id: string | null` to summary/page queries and a bounded
per-project inventory (at most 500 entries) from the same snapshot, independent
of query filters. The version-1 metadata sidecar maps project SHA-256 IDs to
owner-safe display names; strict validators reject controls, path separators,
HOME references, and overlength names. A display label is never authority.

### Historical Advisor plugin and worker architecture (Retired 2026-10-02)

The former DamHopper plugin worker (`plugin/backend/worker.cjs`), SDK integration, and embedded UI provider were retired on 2026-10-02 in favor of native DamHopper integration and VS Code Local support. Historical wire schemas (v1/v2), contract fixtures, and embedded UI specifications remain documented in the [system architecture](./system-architecture.md#9-historical-damhopper-advisor-plugin-integration-retired-2026-10-02) and [cross-project history contract](./all-project-advisor-history.md).
### Workspace Advisor host, history-scope, placement, and compact-view invariants (Phases 01–06)

- Keep `DescribeViewRequest` non-null and limited to `installationId` plus the selected `ServerProjectTarget`; route it through the authenticated host client and registered target resolver. Do not add profile, actor, path, project-ID, scope, or permission authority from the browser.
- Hash only the server-resolved canonical target directory's exact UTF-8 bytes for `workspaceProject.projectId`; never use lossy conversion, a display label, or browser lexical normalization as identity.
- Return actual `historyScope` and existing runner `contextScope` separately. Intersect installation capabilities with actor-effective grants; owner-root implicit rights are only the four history reads, while policy/evaluation operations retain explicit grants.
- Treat `authorityKey` as a stale-work equality/revision value, never as a bearer credential. Describe metadata does not replace authorization on asset read, context open, or invoke.
- Keep the exact response, identity, rejection, and reauthorization contract synchronized with the [Workspace Advisor host contract](./workspace-advisor-host-contract.md).
- In `history-root` scope, `project_id: null` means All; project scope stays bound to its canonical context identity, so null never widens and foreign IDs reject.
- A valid project-ID history directory is not filtered by Workspace registration or display-label sidecars. Labels are presentation metadata and may be `null`; never infer identity from them.
- Keep cursors bound to the snapshot and exact query/scope. Do not reuse one after switching project queries.
- Preserve policy/evaluation source binding and grants independently of history scope; permitted reads may work when no history root is available.
- Reuse the existing v1 storage/v2 wire for evidence-supported valid-ID unmapped records. Do not invent ID-less records or an adapter without verified data and an approved contract change. See the [Phase 02 record](../plans/260929-1346-advisor-workspace-panel/phase-02-history-scope-and-unmapped-records.md).
- Mount exactly one `WorkspaceAdvisorHost` outside Workspace mode branches; IDE, Terminal, and compact slots register geometry/chrome only. Never reparent or remount the iframe for placement or visibility changes.
- Project the connected, nonzero slot rectangle and remeasure on resize, scroll, app zoom, and floating-layout changes with coalesced work and cleanup. Do not poll while idle.
- Keep the host mounted for visual placement/visibility transitions without revocation; retain existing project/profile/owner/authority/connection lifecycle fences. See the [Phase 05 host contract](./workspace-advisor-host-contract.md#phase-05-persistent-workspace-panel-placement).
- Compact Overview/History recompose rather than discard six rates, latency/outcome/missingness caveats, filters, cursor paging, record fields, or detail states. Share project/All scope; keep refresh explicit and never refresh on tab/scope/filter/detail changes.


### React Explorer, evaluation, and packaging standards (Phases 06–10)

- **Pure client state**: The React viewer (`viewer/src/`) is a client-side state machine. State transitions (`idle`, `scanning`, `fresh`, `stale`, `error`) must never execute model calls, mutate disk files, write to browser persistence or cookies, or infer file paths.
- **Inert rendering and security**: Render all user-controlled data (prompts, counsel text, error messages, evaluation metadata) as inert text. Never use `dangerouslySetInnerHTML` or create active external links. Strict CSP (`connect-src 'none'; object-src 'none'; frame-ancestors 'none'`) must be enforced on preview and development servers.
- **Accessibility and responsiveness**: Use semantic HTML and accurate ARIA relationships; `HashTabs` keeps four hash routes, tab semantics, selection state, and roving `tabIndex`; Arrow/Home/End navigation preserves focus visibility and Escape bubbles to Workspace. Verify layouts at narrow container widths, not only full-page viewports.
- **Historical evaluation reader:** The earlier metrics-explorer Phase 06 used an explicit multi-file picker
  bounded to 8 MiB per document. That standalone source has since been removed; this
  is historical behavior, not a current reader or picker API.
- **Generated runtime/inventory authority:** Never hand-edit
  `lib/advisor/generated/*.js`, `src/manifests/controller-inventory.generated.ts`,
  `plugin/ui/dist/`, or root build manifests. Regenerate through the established
  build and inventory scripts.
- **Package/release boundary:** Keep React/Vite development-only and the controller
  inventory at 36 files. Release contents are governed by the current candidate
  inventory; this document does not assert that current release assets were verified.
- **Explicit non-claims**: The explorer provides descriptive visualization only. It makes no POSIX filesystem attestation (`0600` permissions, ownership, symlink authenticity), complete lifetime audit coverage, causal effectiveness, cost, or saved-time claims.
See [system architecture](./system-architecture.md) for complete wire shapes,
limits, closure, adapter boundaries, and support claims.

## Filesystem, locking, and transaction standards

- Normalize relative POSIX paths before joining; reject absolute paths, backslashes,
  dot/dot-dot segments, empty segments, NULs, symlinked ancestors, special entries,
  and containment escapes.
- Keep host-native absolute paths separate from portable metadata. `safePath` and
  `resolveSafePath` use the host branch for context roots; on Windows only
  drive-rooted native paths are accepted and hostile lexical forms fail closed.
- Keep `normalizeRelativePath` slash-relative and platform-neutral for manifests,
  archives, inventories, and receipts; never feed it native host paths.
- `assertNoSymlinkAncestors` is the sole ancestor guard. Walk from the parsed
  native root using `sep`, inspect existing components, stop only when a component
  is absent, and fail closed on other filesystem errors. Context resolution reuses it.
- Managed roots and ancestors must be real directories with contained paths and no symlink ancestry. Preserve host permissions; do not require filesystem UID/SID/ACL, private-mode, or exact-mode attributes. Never chmod or replace unrelated HOME or project data.
- **Preflight before mutation**: Normalize paths, verify ancestors/kinds and
  containment, detect managed-resource ownership conflicts/target overlap, and verify
  same-volume staging before destination reads or mutation.
- **Two-phase project transactions and locking order**:
  1. Acquire HOME publication lock.
  2. Preflight shared controller and project harness destinations.
  3. Commit shared controller to `<home>/.evcrate/bin` on the HOME volume.
  4. Acquire project workspace lock (HOME lock held, never reversed).
  5. Apply harness projections to `<project-root>`.
  6. If harness application fails: roll back only project workspace changes. Shared
     HOME commit is never rolled back or compensated.
  7. Release project lock, then release HOME lock.
- Stage on the destination volume. Publication snapshots bind physical kind,
  device/inode/size, and content digest; compare these before backup/promotion.
- Write journals, markers, policy bytes, and lock metadata through bounded atomic
  temporaries; flush metadata where supported. Follow each component's permission
  policy and do not infer trust or ownership from mode bits.
- **Scope-isolated recovery**: Recover only validated, scope-bound, contained journal
  paths matching the requested scope (`--scope home` reads only HOME state;
  `--scope project` validates canonical `projectIdentity` and reads only
  `stateRoot/project-publication/<canonical SHA-256 identity>`). Restore the complete
  prior set for an interrupted transaction; leave unexpected state and user data
  untouched. Recovery never crosses scope boundaries.
- Publication, scope, and advisor-settings locks are separate transactions. Lock
  release requires matching token and device/inode identity; uncertain release
  leaves state for recovery.

- Advisor state/history metadata comparisons ignore ctime and permission-only drift
  only while type, object identity, link count, and bytes remain stable at CAS;
  lock release/reaping also verifies the lock object and token/process identity.
- Baseline Git evidence normalizes executable-only mode metadata only with matching
  selected content/index evidence; preserve stages, conflicts, and rename endpoints.
Advisor settings uses `advisor-settings.lock`, single-use preview tokens, durable
prepared/backed-up/promoted journals, revision/CAS checks, and whole-document
atomic apply. It never joins scope or target-publication atomicity.
## Build, closure, and release standards

`scripts/generate-controller-inventory.mjs` owns the exact 46-entry closure:
36 shared/Windows files, eight Darwin assets, plus two deterministic advice
activation assets (`evcrate-advice-mode` and `lib/advisor/activation.cjs`). Both entrypoints check canonical Node shebang.
`npm run generate:advisor-runtime` compiles runtime modules incrementally via `scripts/build-typescript.mjs -p tsconfig.advisor-runtime.json` before inventory generation in `prebuild`. Root control-plane compilation runs via `scripts/build-typescript.mjs -p tsconfig.json` (`npm run build`). `npm run typecheck:omp-runtime` (`node scripts/build-typescript.mjs -p tsconfig.omp-runtime.json`) performs a strict `noEmit` typecheck of the generated `.evcrate/source/.omp/evcrate/omp-command-runtime.ts` and must run after `npm run distribute:build` (separate manual gate, not in `npm test` or CI).
`scripts/build-manifests.mjs` invokes the TypeScript local-build path (`runAllManifestsBuild`) for each persisted target and the aggregate set. Build manifests are schema 2 and carry `source_hashes`, `adapter_hashes`, `controller_hashes`, `owners`, `output_hashes`, `validation`, and `home_policy`.

### Target manifest derivation, worker staging, and snapshot safety

- **Single-projection manifest reuse & parallel workers**: `scripts/build-manifests.mjs` and `runAllManifestsBuild` execute target projection once per persisted target. `TargetWorkerPool` supports bounded parallel execution (`--jobs <n>`, default 2 workers), maintaining exact bit-for-bit manifest and projection parity with serial execution.
- **Input snapshot isolation**: `prepareInputSnapshot` creates an isolated staging copy of canonical harness inputs (`.claude`) and compiled runtime (`dist/**/*.js`).
- **Consumed input identity vs manifest tree hash**: `canonicalInputHash` computes snapshot freshness across all consumed files, including `.gitignore` (which Claude projects); manifest `treeHash` retains its canonical definition excluding `.gitignore`.
- **Physical safety and pre-filter rejection**: `visitSnapshotInputs` verifies `assertNoSymlinkAncestors` and `assertRealDirectory`. Unsafe entries (symlinks, non-regular files/directories) throw `PATH_UNSAFE` immediately before any ignore filter is evaluated. Traversal filters (`isIgnoredArtifact`) bypass heavy excluded directories (`node_modules/`, `__pycache__/`) without reading or recursing into descendant paths.
- **Compiled runtime revision binding**: `compiledRuntimeHash` hashes all `.js` outputs in `dist`. The parent compares disk runtime against in-memory `loadedRuntimeHash`; any divergence throws `PUBLICATION_FAILED` across both serial (jobs 1) and worker (jobs 2) execution. Workers execute the snapshot runtime (`sharedInputs.runtimeRoot/distribution/target-worker.js`).
- **Promotion freshness under lock before journal**: In `promoteUnlocked`, `options.hooks?.beforeTransaction?.()` executes input freshness checks (`assertLiveInputsUnchanged`) while holding the promotion lock, strictly BEFORE writing the journal or claiming destination outputs. Source drift fails safely before journal recording, avoiding spurious `ROLLBACK_FAILED`.
- **Adapter hash closures**: All six translated targets (`antigravity`, `codex`, `copilot`, `omp`, `pi`, `vscode`) declare `dist/adapters/uri-restoration.js` in `adapter_sources`; Antigravity also binds the shared Markdown frontmatter parser.
- **Codex URL restoration**: `applyReplacements` uses a linear regex callback to restore placeholder URLs literally without string template interpolation (`$&`, `$$`) or cascading token substitution.
- **Benchmark metric standard**: Build generation benchmark (`scripts/benchmark-build-generation.mjs`) reports post-build parent process RSS (`memoryUsage().rss`), not worker process-tree peak; historical qualification figures remain unchanged.

Publication derives launch intent from paths/shebangs and explicit roles. Linux `install.sh` grants mandatory execute bits and fails if chmod fails. Keep `install.sh`/`install.ps1` inventories in sync with the generated 46-file list; manifest tests reject missing, extra, or external files.
Linux x64 remains the live installed-CLI boundary. Windows release support remains
installer lifecycle and `version --json`; native diagnostics do not widen support.
Darwin includes a prebuilt addon, but runtime remains untested/unqualified and
macOS execution/testing is prohibited.
### Windows fixture and predecessor standards (Phase 04)

- Build Windows fixtures through `buildReleaseArchives` and the real
  `install.ps1`; share sorted-record, inventory/controller/build-manifest digest,
  installer-byte, and metadata authorities with Linux fixtures.
- Freeze every byte-bearing timestamp (`FIXTURE_BUILD_TIMESTAMP`) and compare
  independent builds by filename, size, digest, and content. Do not use wall-clock
  values or duplicate release metadata rules.
- Treat exact labels as qualification markers only:
  `Windows x64 Archive` and `Windows Installer Entrypoint (install.ps1)` must be
  unique, canonical filenames must match, and all four materialized assets must
  pass `verifyWindowsAssetSet`.
- Resolve only non-draft, non-prerelease stable releases through bounded,
  read-only API access. Before qualification history, use only the verified
  `bootstrap-fixture` (`1.0.0`, `v1.0.0`, lowercase `a`×40); afterward inspect
  only the latest stable release and fail closed on uncertainty—never fall back.
- Download into private staging, bound redirects/response bytes, strip tokens
  across origins, verify before and after promotion, and remove partial output
  on failure. Return canonical `{kind, version, tag, sourceCommit, files,
  directory}` records for downstream receipt consumers.

### Canonical candidate and publisher standards (Phase 06)

- Treat `.releaserc.json` and semantic-release's public API as the sole version,
  notes, and prepare authority. Candidate orchestration must use a disposable
  `file://` bare mirror, preserve canonical plugin order, remove only the GitHub
  plugin, set `publish: []`, and never reimplement Conventional Commit rules.
- Require a clean checkout, one exact lowercase 40-hex source commit, branch/ref
  validation, and containment checks before clearing stale `dist/release` or
  candidate output. Seed only the local mirror with the triggering ref and tags;
  always remove it in `finally`.
- Build candidates with an allowlisted child environment and
  `EVCRATE_RELEASE_ASSET_MODE=build`; strip `GITHUB_TOKEN`, `GH_TOKEN`, and
  `NPM_TOKEN`. A false semantic-release result succeeds with `has_release=false`
  and no handoff.
- Stage privately, hash staged bytes, and atomically promote one tree containing
  exactly seven candidate assets, four predecessor assets, one qualification
  harness, and `candidate.json` (`evcrate-release-candidate/v1`). Receipt records
  use canonical code-point ordering and non-symlink regular files.
- Emit only the nine fixed `$GITHUB_OUTPUT` scalars defined by the candidate
  contract. Scalars route workflow jobs; the receipt remains the durable byte
  authority and must agree with every scalar/hash.
- The publisher is verify-only: require `EVCRATE_RELEASE_ASSET_MODE=verify`,
  expected receipt/version/tag/source/run identity, and producer hashes; clear
  `dist/release`, copy only verified `assets/`, verify again, and call canonical
  semantic-release. It must not build, repair, or accept `false`/identity
  mismatches.
- Keep `npm run release:candidate`, `npm run release:verify-assets`,
  `npm run test:installer:windows`, and `npm run semantic-release` bound to these
  wrappers. Do not hand-edit `package-lock.json` or root `CHANGELOG.md` for
  orchestration.

The focused orchestration suite covers clean/dirty checkout, release paths, mirror cleanup, receipt/tamper checks, exact outputs, and verify-only publication (12/12 orchestration tests, 29/29 `npm run test:release`).

### Release workflow producer, matrix, and publisher standards (Phase 07)

- Keep `.github/workflows/release.yml` read-only by default; grant GitHub write scopes only to the success-gated publisher.
- Preserve ordered Linux gates before candidate creation; no-release results never upload or trigger downstream jobs.
- Route matrix and publisher bytes by exact `artifact_id`, never by artifact name or digest; receipt and producer hashes remain authorities.
- Keep the native matrix fixed at `windows-2025` x64 with PowerShell 5.1/7 crossed with Node `22.19.0`/`24.21.0` (`fail-fast: false`).
- Matrix jobs consume artifact-carried harnesses without checkout/npm; publisher verifies exact source SHA and copies only seven assets.
- Pin actions to full commit SHAs with version comments; pass expressions via step `env:` blocks instead of shell script interpolation.

### Windows release qualification and installer safety standards (Phases 03, 08, 10)

- **Installer safety protocol**: Standalone `install.ps1` must enforce strict root containment (`Assert-ContainedPath`), reparse-point ancestor rejection (`Assert-NoReparseAncestor`), exclusive delete-on-close locking (`Acquire-InstallLock` with random token), snapshot verification, and safe rollback/repair/uninstall lifecycles without touching unmanaged data. Never recommend `-ExecutionPolicy Bypass`.
- **Exact-set verifier authority**: `scripts/release/asset-verification.cjs` is the sole release-set verifier. Exact-seven (`verifyReleaseAssetSet`) and exact-four (`verifyWindowsAssetSet`) reject missing, extra, directory, symlink, hash, size, and metadata mismatches without byte repair.
- **Workflow permissions and isolation**: Producer is read-only (`contents: read`); matrix rows run unprivileged; publisher is the sole write-capable job (`contents: write`). Publisher must never rebuild assets or publish on failure/cancellation (<code>always()</code> is strictly banned). Downstream jobs consume the exact `artifact_id` handoff.
- **PR smoke boundary**: `windows-smoke.yml` runs diagnostic smoke on `windows-2025` x64 with PowerShell 7 and Node `22.19.0` using checked-in version/SHA fixtures (`--allow-fixture-identity`); it has zero secrets, write permissions, or release handoff authority.
## Testing and review standards

Tests defend observable behavior: strict parser/manifest contracts, bounded scans,
capability approvals, non-mutating previews, token expiry/replay, managed/unmanaged
collisions, CAS hashes, output ownership, controller closure, symlink/owner checks,
staged-root cleanup, locks, stale quarantine, promotion recovery, and advisor policy
recovery. Prefer temporary roots and real filesystem/process behavior. Do not weaken
checks with fake success paths or assertions on incidental implementation details.

### Hook-policy test suites

Run the focused suites sequentially with direct `node` commands before
projection or publication:

| Suite | Contract |
|---|---|
| `scout-block/tests/test-path-extractor.js` | Quote/escape-aware extraction, directory markers, runner syntax, and shell segments. |
| `scout-block/tests/test-pattern-matcher.js` | Twelve trailing-slash defaults, descendants, near-matches, Windows paths, legacy rules, and negations. |
| `scout-block/tests/test-build-command-allowlist.js` | Production `isBuildCommand` classification; no duplicated regex authority. |
| `hooks/tests/test-scout-block.js` | Hook-process exit codes for build allowances, blocked reads, and adversarial chains. |
| `hooks/tests/test-evcrateignore.js` | Canonical/fallback/custom policy behavior; byte restoration in `finally` and termination handlers. |
| `scout-block/tests/test-monorepo-scenarios.js` | Nested package and deep generated-directory protection. |

The 2026-09-07 Phase 04 evidence records 299/299 focused assertions, plus
successful `npm run build`, `npm run distribute:build`, `npm run distribute:check`,
and projected/published OMP smoke values `0, 0, 2, 2`. Keep both positive build
cases and negative directory-read/search cases; a build exemption must never
cover a later or chained access to a protected path.

Tests that mutate canonical policy must snapshot the original bytes, restore them
in `finally` and termination handlers, and remove backups or temporary drivers
before reporting success.

## Documentation standards

- Keep Markdown files below the repository limit of 800 lines; keep README strictly
  below 300 lines. Split oversized historical/reference topics into linked documents
  instead of exceeding either limit.
- Link only to verified files under `docs/` or the repository root.
  `docs/project-changelog.md` mirrors phase evidence and boundaries; root
  `CHANGELOG.md` is semantic-release output, not the phase-authority document.
- Date-stamp Unreleased documentation entries where project conventions require it.
  Do not invent release versions, test totals, APIs, environment variables, or
  support claims.
- Keep detailed controller/distribution/supervision authority in
  [system architecture](./system-architecture.md), requirements in the
  [PDR](./project-overview-pdr.md), and source navigation in the
  [codebase summary](./codebase-summary.md).

## References

- [System architecture](./system-architecture.md), [Project overview and PDR](./project-overview-pdr.md), [Codebase summary](./codebase-summary.md).
- [Project roadmap](./project-roadmap.md), [Project changelog](./project-changelog.md), [Project changelog archive](./project-changelog-archive.md).
- [Pre-Upgrade Backup & Leftover Guidance](./upgrade-backup-and-leftover-guidance.md).
- [Pi-native migration](./pi-native-migration.md).
- [Historical Advisor integration](./system-architecture.md#9-historical-damhopper-advisor-plugin-integration-retired-2026-10-02); [Workspace Advisor host contract](./workspace-advisor-host-contract.md).
