# Project Overview and Product Development Requirements

**Baseline:** `evcrate@3.0.0` (private Node/TypeScript package, Node `>=22.19.0`).
**Target Topology:** `3.0.0` (stable on `main`).
**Status:** Requirements for the completed harness-only repository cutover; live vendor/native-host acceptance remains separate.
**Updated:** 2026-10-12
**Scope:** EVCrate package, seven persisted target projections, resource management, atomic publication, recovery, and release.

EVCrate turns one canonical agent-harness source tree into verified target
projections and publishes those projections safely. This PDR records observable
requirements; implementation detail belongs in the [system architecture](./system-architecture.md)
and [code standards](./code-standards.md).
## Product intent

EVCrate gives maintainers one source of truth for Claude-oriented harness resources
while supporting Claude, Codex, Antigravity, Pi, OMP, Copilot, and VS Code Local projections.
It must make generated output reproducible, publication recoverable, and native
context/report procedures bounded and fail-closed.

### Users and outcomes

| User | Outcome |
|---|---|
| Harness maintainer | Author once under `.evcrate/source/.claude/`, then rebuild verified projections. |
| Package consumer | Invoke the private npm CLI without a Python runtime on the default path. |
| Main-session user | Confirm a reframed problem before receiving a sanitized inline interview report. |
| Release operator | Preview, publish, or recover target output without replacing unmanaged HOME data. |
| Pi/Copilot user | Receive a target-specific projection with explicit migration boundaries. |

## Scope and constraints

### In scope

- Strict bounded JSON/protocol contracts and sanitized errors.
- Schema-2 target definitions/resource registry and strict BuildManifest v3.
- Seven fixed projection adapters (`claude`, `codex`, `antigravity`, `pi`, `omp`, `copilot`, `vscode`), with no discovery or fallback adapter.
- CAS-aware imports, scopes, build, publication, and recovery.
- One harness transaction per selected `--scope home|project`, with journal v4,
  marker v3, scope-derived locks, rollback, and bounded strict historical recovery.
- Main-session `/evc-cmd-advise` interview/report semantics, shared across seven targets.
- Canonical command and agent naming as `/evc-cmd-*` (with `-x-` segment separation) and `/evc-*`; VS Code Local uses container-local `cmd-*` command skills under plugin `evc`.

### Out of scope for this baseline

- Editing generated projections or renaming canonical source commands.
- A daemon, background broker, or generic/unbounded CLI retry loop.
- Broad Windows runtime equivalence (`publish`, general CLI/process parity),
  desktop/non-admin/UAC/SmartScreen/enterprise environments, Authenticode,
  execution-policy workarounds, and unsupported native-host qualification.
- npm/GitHub publication, deployment, or operator rollout without separate authorization.

The Windows support boundary is standalone installer lifecycle and `version --json`
on the matching hosted x64 matrix. Prior candidate results are not current acceptance.

## Product requirements

### FR-1: Canonical authoring and projection

**Requirement:** Canonical harness resources are authored only under
`.evcrate/source/.claude/`. Target manifests and overlays select generated outputs.
The canonical inventory is 140 resources: 17 agents, 70 commands, 13 hooks,
34 skills, and 6 workflows.

**Acceptance:** A build reads canonical `.claude/AGENTS.md` through the resource
graph, registers every current fixed adapter, rejects missing/duplicate/unsupported
targets, and emits validated projections without overwriting the authoring tree.
Native delivery must match actual HOME/project loaders; unavailable native surfaces
remain explicitly unqualified. Generated output is never an authoring source.

### FR-2: Deterministic target authorization

**Requirement:** Schema-2 manifests declare resource roots, output roots, HOME
bindings, promotion order, collision policy, and any declared patches. Paths must be
normalized, non-overlapping, non-symlinked, and contained.
Host context roots are validated as native absolute paths by the context boundary;
portable manifest/archive/inventory identities remain normalized relative POSIX
paths and are not widened for Windows.

**Acceptance:** Unknown fields, traversal, backslashes, duplicate roots, unsafe
ancestors, nested/equal output roots, invalid patches, or unsupported target IDs fail
before projection or publication. Native path and shared ancestor checks fail before
filesystem use; broader Windows runtime equivalence outside the installer/version subset remains out of scope.

### FR-3: Bounded resource registry and imports

**Requirement:** `.evcrate/registry.json` remains a distinct schema-2 canonical
resource registry. Scans validate canonical and resource-root containment and are
deterministic and bounded. Resource file identities bind content and physical kind,
not permission bits; direct-file imports use the same domain-separated hash as
registry scanning/verification, while generic `hashFile` remains a raw byte digest
and directory-tree identities remain unchanged. Explicit imports use immutable
preview descriptors and single-use tokens.

**Acceptance:** Scans reject symlinks/special entries and stale content or kind;
permission-only changes do not change resource identity. Preview writes no canonical
or generated content; apply rechecks source identity, hashes, registry/manifest/
adapter bindings, approvals, destination, provenance, and expiry. The committed
schema-2 registry is regenerated through `npm run generate:registry`; prior raw-file
hashes are not silently accepted. Capability signals remain separate from content
identity; executable capability derives from file extensions and shebang bytes, not source permission bits. Filesystem-policy Phase 02 completed journal migration and host-specific qualification.
Conflicts preserve unmanaged or differently-owned nodes.

### FR-4: One-shot TypeScript CLI

**Requirement:** The `evcrate` bin parses one invocation, resolves one immutable
context, dispatches one operation, writes one validated result, and exits. Supported
operations are version, resource/import, scopes/changes, and distribution
build/check/publish/all/recover.

**Acceptance:** `--request-file` accepts one complete bounded versioned envelope and
is mutually exclusive with positional construction. Unknown input and child failures
produce stable sanitized errors; no daemon, listener, generic/unbounded retry loop,
or arbitrary launcher is introduced. The package exposes only the `evcrate` bin and
requires Node `>=22.19.0`.

### FR-10: Publication and recovery

**Requirement:** Build/check, publication, and recovery are separate operations.
Publication consumes a verified strict BuildManifest v3 and stages complete harness
output on the selected destination volume, preserving unmanaged files.
- Scalar scope is `home|project`, default `home`; targets select harness bindings only.
  Current HOME bindings follow the eight-entry `PUBLICATION_BINDING_ORDER`
  (`.agents/skills`, `.codex`, `.pi`, `.gemini/config`, `.omp`, `.claude`, `.copilot`,
  `.evcrate-vscode`) without `.evcrate/bin`, while `PREDECESSOR_BINDING_ORDER` retains
  historical bindings for recovery.
- Each scope has one harness commit; project publication does not first commit
  HOME infrastructure or acquire HOME publication locks.
- Journal v4 and marker v3 contain exactly `{harness}` records; `readReleaseMarker`
  and `writeReleaseMarker` support `schema_version` 1, 2, and 3. Actual scoped
  workspace device/inode/parent identity is required before the first staged journal;
  the complete journal is persisted before destination mutation.
- Successful resource-control v1 publication payload has one committed harness
  phase with real release identity; project retained release is null.
- Failure uses the ordinary exact error-only envelope, preserving structured
  error codes and conflict behavior. `PUBLICATION_FAILED`/`ROLLBACK_FAILED` are
  exit 5, without a fake phase/release or restoration claim on rollback failure.
- Recovery is scope-isolated and preserves strict admitted historical journals
  v1/v2/v3 and markers v1/v2. Python-era marker parsing does not create publication
  recovery; separate existing generic promotion-journal recovery remains.

**Acceptance:** Stale/missing/extra/mismatched source, adapter, owner, or output
hashes block publication; unknown/old active manifests fail with actionable rebuild
guidance. Preflight rejects overlaps/unsafe paths and CAS drift. Ordinary publication
preserves unselected validated harness ownership, old `.evcrate/bin`, user-owned
data, and unmanaged files. Historical interrupted recovery can restore admitted
transaction-owned before/intended bytes as data without executing them.
Existing predecessor harness cleanup remains file-only and ownership/CAS-gated.
Failed recovery preserves evidence. Current package scripts use the TypeScript path.
### FR-12: Unified command/agent naming, canonical AGENTS.md, and release promotion

**Requirement:** Documentation and maintained source use canonical `/evc-cmd-*` command names,
`/evc-*` custom agents, and `evc-<skill>` / `evc-style-<style>` Copilot skills and styles.
VS Code Local projects `cmd-*` command skills within plugin `evc`; other targets retain `evc-cmd-*`.
Nested commands retain the reserved `-x-` separator and reversible semantic identifiers.
Resource names conform to spec64 (`^[a-z0-9]+(-[a-z0-9]+)*$`, <= 64 chars, no `_`, `:`, `--`); the colon in host-qualified `/evc:cmd-*` is not part of the resource name. Instructions author solely in `.evcrate/source/.claude/AGENTS.md`. Upgrades
enforce ownership-based pruning with pre-upgrade customization backup warnings and unmanaged collision refusal.
Releases qualify on `main` (`3.0.0`) on Linux before publication, while Windows qualification (`pwsh.exe` + Node `24.21.0` on `windows-2025`) runs on pull requests.

**Acceptance:** Core docs and all seven active target projections retain unified canonical identities,
with container-local VS Code command names and zero compatibility aliases. Canonical naming authority is `src/adapters/resource-naming.ts`, enforced by
`.evcrate/source/.claude/scripts/scan_commands.py`. Claude publishes native unconditional
`.claude/rules/AGENTS.md` (no duplicate direct AGENTS or CLAUDE shim). Pre-upgrade backups are required;
recorded ownership controls pruning. Candidate builds on `main` validate via disposable bare mirror topology before `publish-release.cjs` verifies `candidate.json` and exact-seven asset digests and publishes `3.0.0`.

### Native command context

**Requirement:** OMP and Pi projections wrap command invocations in bounded, versioned
native context headers (`evcrate_omp_command_context` v3 and `evcrate-pi-command-context` v2)
while transporting raw task arguments unchanged. The advisor subsystem, `advisory-interview.md`,
`plan-progress.md`, and `/evc-cmd-advise` are retired; all 69 canonical commands use pure
baseline prompt structures.

**Acceptance:** Exact OMP v3/Pi v2 headers are specified in [architecture](./system-architecture.md#5-native-command-context).
Native context retains installed-root containment, raw transport, child/tool/nesting
bounds, and privacy/scout guards. Real host turns/discovery are required evidence;
generated files and portable tests alone do not qualify them.

### FR-14: Deterministic Windows predecessor boundary

**Requirement:** Build a reproducible Windows fixture from the shared archive and
installer authorities, then resolve the predecessor for a release candidate using
bounded, read-only stable-release metadata and exact-four verification. The
qualification state is irreversible: use the verified `bootstrap-fixture`
(`1.0.0`/`v1.0.0`/`a`×40) only before any qualified release; afterward require the
latest stable release and never fall back to an older release or bootstrap.

**Acceptance:** Independent fixture builds have identical names, sizes, SHA-256
digests, and bytes. Exact labels are unique and paired with canonical ZIP,
sidecar, metadata, and `install.ps1` assets. Missing/tampered/duplicate assets,
unqualified latest releases, candidate versions not greater than the predecessor,
or required API/token/download failures fail closed with no partial output.
The normalized predecessor handoff is ready for receipt staging. Predecessor
qualification is verified as part of the bounded Windows release qualification (FR-17).


### FR-15: Canonical semantic-release candidate and verify-only publisher

**Requirement:** Produce one release candidate through the canonical semantic-release
v22 API in a disposable local bare mirror, then publish only the verified candidate
bytes. Candidate execution uses the canonical plugin order with the GitHub plugin
removed, `EVCRATE_RELEASE_ASSET_MODE=build`, and no release credentials. The
publisher uses the canonical configuration with `EVCRATE_RELEASE_ASSET_MODE=verify`.

**Acceptance:** A clean checkout captures one branch and exact lowercase 40-hex
source commit. A releasable run verifies exact seven candidate assets and exact four
predecessor assets, stages those bytes plus the qualification harness, and writes one
canonical `evcrate-release-candidate/v1` `candidate.json` receipt. Receipt file
records are sorted and hash the staged bytes. A no-release result returns success
with `has_release=false` and no handoff.

The candidate emits exactly nine safe scalar outputs:
`has_release`, `version`, `tag`, `source_commit`, `artifact_name`,
`windows_archive_sha256`, `windows_sidecar_sha256`, `metadata_sha256`, and
`install_ps1_sha256`. The publisher requires the receipt, run/release identity, and
producer hashes; it copies only verified `assets/` into `dist/release`, cannot build
or repair, and fails closed on tampering, `semantic-release=false`, or any
version/tag/source mismatch.
The final semantic-release result must match the receipt exactly. Candidate and
publisher verification feed the release matrix without authorizing live npm/GitHub publication.

### FR-16: Release workflow trust separation

**Requirement:** The release workflow separates candidate production, native Windows
qualification, and publication into jobs with least-privilege permissions. One
immutable artifact ID and receipt bind the producer's bytes to every matrix row and
to the verify-only publisher.

**Acceptance:** `main` push/manual runs use non-canceling concurrency and read-only
defaults. The Ubuntu/Node 24.21.0 producer retains its Linux gates and uploads only
on `has_release=true`; four `windows-2025` x64 PowerShell 5.1/7 × Node
22.19.0/24.21.0 rows consume the exact artifact ID without checkout/npm.
The sole publisher starts only after all four matrix rows succeed, checks out the
producer SHA, copies exactly seven assets, re-verifies receipt/hash/run identity,
and invokes semantic-release in `verify` mode. Phase 09 integrated qualification
verified this trust separation and final published-byte equality.


### FR-17: Bounded Windows release qualification

**Requirement:** Qualify one immutable release candidate across the supported
hosted Windows matrix for standalone installer lifecycle operations and clean-install
verification before publication. Broad CLI Windows equivalence remains out of scope.

**Historical milestone:** Phase 10 completed 2026-09-15 for its original candidate; current qualification remains pending.

**Acceptance:** Hosted `windows-2025` x64 execution succeeds across all four release
matrix rows (Windows PowerShell 5.1 and PowerShell 7 × Node 22.19.0 and Node 24.21.0)
over the exact candidate artifact ID. Standalone lifecycle operations (`install`,
repeat-install, `repair`, upgrade, `rollback`, `uninstall`) and `version --json` execute
without error; state and bin directories remain contained under `%LOCALAPPDATA%\EVCrate`;
and diagnostic PR smoke (`windows-smoke.yml` on PowerShell 7 + Node 22.19.0) passes
without publication authority. General runtime commands/process parity,
desktop/UAC/SmartScreen/Authenticode/enterprise-policy environments, and
execution-policy workarounds remain explicitly excluded. Current matching-host
qualification must be exercised separately.

### FR-24: Launchability and filesystem identity (Phase 01)

**Status:** DONE (2026-09-27). Historical implementation and review details are summarized in the [project changelog](./project-changelog.md); the original plan and review artifacts are not retained in this repository.

**Requirement:** Keep launch permission, capability assessment, content identity, and
CAS evidence distinct. Publication derives launcher intent from materialized paths,
published bytes, and explicit launcher roles; it does not use source permission bits
as publication-plan identity. Resource file roots use a file-kind-separated hash
shared by canonical registry scanning/verification and direct-file imports.
Content identity remains separate from executable capability metadata.

**Acceptance:**
- A fresh HOME/project publication can materialize shebang-bearing and explicitly
  recognized launcher files as directly runnable POSIX outputs; content-equal
  publication remains a no-op. Permission-only plan changes do not create operations.
- The Linux installer provisions required CLI launcher roles independently
  of tar execute bits, verifies the staged CLI shebang, and invokes the staged path
  directly. Required execute-bit provisioning failure aborts; local-build staging
  reports its existing sanitized `PUBLICATION_FAILED` error.
- Lock cleanup remains bound to the lock object and token/process identity.
- Direct resource-file identity cannot alias a directory-tree identity; scanner,
  registry verification, and direct-file import agree. Generic `hashFile` remains
  a raw byte hash, and directory tree encodings remain unchanged.

**Boundary:** Mode/suffix/shebang inputs remain separate capability metadata. Phase 01
does not decide whether execute-bit-only capability transitions are an exception to
chmod-invariance. Durable journal recovery/migration policy and Windows readiness or
production-runtime qualification remain outside this phase.

### FR-25: VS Code Local native support

**Requirement:** Keep `vscode` as a distinct persisted target for an isolated Agent
Plugins 1.0 bundle (`plugin.json` name `evc`, formerly `evcrate-local`) under project or HOME `.evcrate-vscode`.
Registration in `chat.pluginLocations` is user-controlled, manually or via explicit
optional CLI registration/prompt. Eight native hook events retain scout/privacy
policies, fail-closed unqualified tools, and the CommonJS runtime closure.
Explicit session context retains atomic CAS v1 and bounded retention
(7d, 256/project, 1024/user). Preserve Copilot CLI coexistence and inert opt-in MCP examples.

**Acceptance:** Core release assets remain exactly seven. Historical Linux x64
VS Code 1.140.0/Copilot Chat 0.68.0 receipts describe their original candidates,
not qualification of the current source cutover or inline interview.

**Container-aware naming acceptance:** Canonical `evc-cmd-*` commands become `.evcrate-vscode/skills/cmd-*/SKILL.md`, preserving `-x-` nesting and semantic command IDs. Copilot Chat displays `evc cmd-*`; `/<plugin-name>:<skill-name>` resolves to `/evc:cmd-*` without duplicate `evc` prefixing. `replaceCommandInvocations` in `src/adapters/vscode/references.ts` rewrites `/evc-cmd-*` and `$evc-cmd-*`, including wildcard families, to local `/cmd-*` and `$cmd-*`. Shared `ev-help.py` discovers both `evc-cmd-*` and `cmd-*` skill directories.
### FR-26: Standalone SonarQube test quality extension and dual-root installer (Phases 01–08)

**Requirement:** Maintain `ext/sonarqube-test-quality/` as a standalone extension outside the canonical harness source tree, registry inventory, and seven core projections. It provides language-neutral SonarQube triage, scanner lifecycles, test/coverage verification, cycle ledger contracts, sanitized run guidance, portable `sonar-evidence` actor prompt, and the `cmd-sonar-remediate` command skill prompt. The standalone installer (`lib/install.js`, `bin/install.js`) installs into `<project>/.agents/skills/` and/or `<project>/.claude/skills/` without mutating core package publication metadata, canonical resources, or native host settings.

**Acceptance:**
- Target selection requires explicit `--target agents|claude|both` and `--directory <project-root>`. Unsupported or missing targets fail closed. Legacy `--target agents` preserves paths under `<project>/.agents/skills/sonarqube-test-quality/`.
- Selected roots install exactly two skill entrypoints (`skills/sonarqube-test-quality/SKILL.md` and `skills/cmd-sonar-remediate/SKILL.md`) and 18 assets per root (36 total for `--target both`), writing zero unselected root payload, settings, or native registrations.
- Execution enforces two-tier locking (project-level `.sonarqube-test-quality.install.lock` followed by legacy `.agents/skills/sonarqube-test-quality/.install.lock` whenever `agents` is selected), releasing owned locks in reverse order on exit or failure.
- In-process transactional staging occurs beside destinations on the same volume; caught failure restores prior bytes across roots, removes owned additions and empty owned directories, preserving concurrent/unrelated files, and surfaces partial rollback if restoration encounters conflicts (no persistent journal, crash recovery, or atomic reader visibility claim).
- Path and symlink security validates that project root and ancestors are non-symlink regular directories; replacement requires `--force` plus `--yes` (unattended / API) or `--force` with interactive confirmation, and never overrides type safety or containment checks.
- Package manifest `package.json#files` includes `commands`, `agents`, `templates`, references, scripts, and documentation (23 packaged tarball files).
- Standalone extension tests (114/114 passing across 8 suites) verify installer contracts, layout resolution, locking, fault rollback, actor/command specifications, behavioral eval catalog schema/assertions, and state transition simulations. Packed tarball extraction and multi-target installer smoke pass in isolated workspaces. Historical report lessons (56 tests, 46.48% line, 63.91% branch) and vendor documentation boundaries inform policy without corporate defaults. Live consuming-host LLM execution and live Sonar server qualification remain unexercised boundaries.


## Non-functional requirements

| Area | Requirement |
|---|---|
| Operability | Dry-run/apply, scoped recovery, sanitized receipts/errors, and clear ownership of user-managed state. |
| Bounded work | Bound documents, paths, files, process streams, deadlines, workspace, and transaction state. |
| Reproducibility | Canonical JSON, deterministic ordering, SHA-256, domain-separated resource-file/tree identities, and exact closure manifests; permissions are not content hashes. |
| Isolation | No credentials in requests/results/reports; preserve native privacy policies and bounded child process environments. |
| Compatibility | Preserve explicit target boundaries; never silently synthesize unsupported adapters or aliases. |
| Maintainability | One parser, path policy, hashing policy, lock protocol, and error serializer per boundary. |

## Observable release gates

Repository build, regeneration, Linux installer, and automated test gates are exercised
for this cutover; live vendor/GUI and native Windows host acceptance remain separate.

1. Seven schema-2 target definitions and the 140-resource registry validate.
2. Clean build, deterministic projections/catalogs, and strict aggregate/per-target
   BuildManifest v3 pass current provenance/owner/hash checks.
3. Fresh HOME/project and repeated/subset publication affect only scoped harness
   bindings and preserve unselected ownership, old installed roots, and user data.
4. Apply, rollback, interruption, and strict historical recovery enforce physical/byte
   CAS, unsafe-path rejection, workspace identity, scope isolation, and failed-evidence retention.
5. CLI/request-file/JSON/import/scope/native context and privacy behavior remain covered.
6. Current release metadata v2, exact archives/assets, one-bin package inventory
   (`evcrate -> dist/cli/evcrate.js` enforced in both `install.sh` and `install.ps1`),
   v2 repair recovery of missing/corrupt predecessor receipts without reading receipt
   contents, and narrow v1 recorded predecessor repair/rollback requiring a regular
   non-symlink/non-reparse `installer-receipt.json` matching snapshot, version,
   archive, and inventory digests are exercised.
7. Candidate/receipt/verify-only publisher and candidate-bound stable authorization
   pass established release gates; repository checks never authorize live publication.
8. Matching native Windows matrix qualifies only standalone installer lifecycle and
   `version --json`; desktop/signing/broad runtime environments remain excluded.
9. Actual-host inline interview, correction/confirmation/cancel/nonconvergence,
   no-clobber report privacy, and OMP/Pi command entry are exercised where available.
   Missing hosts/model/report-write capability remain explicitly unqualified.

## Documentation map

- [Agent guidance](../AGENTS.md) — shared agent workflows and subagent completion contract.
- [System architecture](./system-architecture.md) — distribution, context, wire, isolation, and publication contracts.
- [Code standards](./code-standards.md) — normative implementation and naming rules.
- [Codebase summary](./codebase-summary.md) — source/module/generated-output map.
- [Project roadmap](./project-roadmap.md) — package milestones and current release boundaries.
- [Project changelog](./project-changelog.md) — dated phase evidence.
- [Project changelog archive](./project-changelog-archive.md) — older phase detail.
- [Pi-native migration](./pi-native-migration.md) — Pi-specific projection/runtime notes.
- [Snyk specialist guide](./snyk-expert-cli.md) — standalone common .agents bundle.
- [Upgrade & leftover guidance](./upgrade-backup-and-leftover-guidance.md) — pre-upgrade backup and collision rules.
