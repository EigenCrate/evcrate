# Snyk specialist + reusable task skills

Standalone Claude project bundle: one specialist decision owner, two independently useful procedures. Maven/Spring is the only concrete remediation procedure. Ecosystem-neutral records are not support for guessed commands in other ecosystems.

## Delivery and qualification limits

The agent and recipe are authored; procedure/interface authoring for both skills has prior review receipts. **Operational qualification remains unverified:** deployed Claude native preload, actual child reference consumption, effective host permissions, real human approval/drift behavior, original six source findings, target graph/build/runtime and comparable Snyk scans are Phase 05 gates. Constructed authoring scenarios cannot pass those live gates. No fixed release, successful target remediation, cross-harness parity, publication or production readiness is claimed.

This `ext/snyk-expert/` folder is not an EVCrate-managed projection. Starting Claude at the EVCrate repository root does not discover this nested bundle. Do not edit canonical/generated EVCrate resources or the skills-only authoring command to install it.

## Install easily via npm / npx

Install the bundle directly into any project using the zero-dependency CLI installer:

```bash
# In your target project:
npx @evcrate/snyk-expert

# Or specify a target directory explicitly:
npx @evcrate/snyk-expert --target /path/to/project

# Dry run to preview additions and unchanged files:
npx @evcrate/snyk-expert --dry-run

# Local execution from repository checkout:
node ext/snyk-expert/bin/install.js --target /path/to/project
```

### CLI Installer Safety Guarantees

- **Project-Local Only:** The installer defaults to the current working directory (`process.cwd()`) and strictly refuses to default to user `$HOME` (`~/.claude/`) to prevent polluting global configurations.
- **Collision Detection & Protection:** Existing files that differ trigger collision warnings and fail closed. Overwrite requires explicit `--force` plus interactive confirmation (or non-interactive `--force --yes`). `--yes` alone without `--force` is rejected.
- **Atomic Staging & Integrity:** Files are staged to temporary files in destination directories and atomically moved (`renameSync`) with complete byte-level integrity verification.
- **Preserves Pre-existing Files:** Pre-existing unrelated agents and skills under target `.claude/` are preserved untouched.
- **Symlink Defense:** Rejects destination paths or components containing symlinks that escape the target project root.

## Install locally without overwriting existing resources

Inspect the designated **isolated qualification project** and existing agent/skill names first, including higher-priority managed/session definitions. Resolve collisions with the owner; never blindly overwrite, merge incompatible procedures or depend on checkout symlinks. Copy the following files byte-for-byte into that project's `.claude/` subtree, preserving skill-relative references. Keep this README with the bundle as installation/use documentation; it is not a runtime dependency.

```text
<installed-resource-root>/
└── .claude/
    ├── agents/snyk-expert.md
    └── skills/
        ├── dependency-upgrade-review/
        │   ├── SKILL.md
        │   └── references/
        │       ├── compatibility-evidence.md
        │       └── review-output.md
        └── snyk-fix/
            ├── SKILL.md
            └── references/
                ├── finding-and-owner-contract.md
                ├── maven-spring-remediation.md
                └── verification-and-results.md
```

The installed resource root may differ from the remediation target root. Launch Claude from the installed project and explicitly pass both canonical roots; separately authorize target/report reads, commands, writes and network access. `--add-dir` grants additional access and may load configuration; do not use it as a synonym for authorizing arbitrary remediation. Never default to user HOME installation.

Start a fresh Claude session after installation so newly created agent/skill directories are discovered. Record `claude --version`, active definition source, effective parent settings/mode, tool availability and local resource inventory. Check skills with the deployed session's supported discovery interface. Agent descriptions aid model selection, not guaranteed routing; explicitly ask **delegate to snyk-expert** if natural-language selection does not occur. Do not confuse `claude agents` background-session listings with custom-agent discovery.

## Main-owned permission/trust boundary

Agent `tools` is a capability list, not a file sandbox; Bash can write without Edit/Write. Skill instructions and `permissionMode: default` do not prove isolation or semantic approval enforcement. Parent mode/rules and managed policy can override child behavior. Inherit the parent's model; no provider-switching mechanism is needed.

Before qualification, the operator must provide a disposable target copy, protected user-change snapshot, single remediation writer, authorized report/artifact directories, restricted filesystem/process/network access and registry/Snyk transmission authorization. Inspect effective settings via the deployed permission interface; refuse `bypassPermissions`, `acceptEdits`, automatic permissive modes or broad command allows. Do not disable global restrictions or install scanners/toolchains just to make a run continue. Commands execute project code: graph/build/runtime/scanner authorization is separate from report-read permission.

For an isolated **read-only authoring smoke**, the parent may use this session settings fragment after inspecting inherited/managed policy. It is deliberately unusable for remediation:

```json
{
  "permissions": {
    "defaultMode": "dontAsk",
    "deny": ["Bash", "Edit", "Write", "WebFetch", "WebSearch"]
  }
}
```

Permit only local Read/Glob/Grep in that smoke and omit outside access/network. Verify actual effective tools, denied actions and unchanged content; settings syntax alone is not proof. For live remediation, configure target-specific permissions under normal manual approval plus a real sandbox/isolated environment. Do not copy the read-only deny list then claim remediation works. On observed Claude 2.1.250, CLI help offers `--permission-mode manual`; agent frontmatter's documented `default` is distinct from CLI spelling. Retest syntax and enforcement on the deployed version. Invalid settings can be silently ignored in print mode; inspect effective configuration rather than trusting process exit.

Tool permission approval permits a tool action; it is not the exact dependency-change human decision below. A human decision likewise cannot grant a missing host permission or artifact. Restricted tools during an authoring smoke do not prove the live Bash/network/filesystem boundary.

## Bind a delegation, never infer a target

Read the installed [scope/finding/owner/approval contract](.claude/skills/snyk-fix/references/finding-and-owner-contract.md) and [verification/result contract](.claude/skills/snyk-fix/references/verification-and-results.md). Main passes one structured Markdown record using their fields. The examples below are templates, **not executed commands, real baselines or granted approval**; fill every fact from authorized observation, otherwise `unknown — reason` and stop the affected action.

Minimum record:

- Request source, exact operation, canonical installed resource root and explicit canonical target root/repository identity.
- Exact HEAD, index/worktree manifest identities/hashes, relevant files/values and pre-existing staged/unstaged/untracked changes. HEAD alone is insufficient.
- Allowed edit/read paths, manifest/module roots, exact modules/profiles, affected consumers and explicit out-of-scope paths.
- Original authorized report path/secure locator, format/date/complete-byte hash; companion JSON/SARIF identities and relationship. Missing original findings remain unknown, not reconstructed from counts.
- Baseline graph and scan artifacts with scope/time/versions/argv, organization, policy/ignore/severity, database identity when available and path/coverage limits.
- Available toolchain, registry/network/private access, parent-authorized exact graph/build/test/runtime/scanner commands, expected consumer observations and safe output locations. No credentials in delegation or retained evidence.
- Effective host permissions/trusted execution boundary, single-writer and authorized selective rollback owner; existing compatible patch/minor policy.
- Optional exact human approval record bound to the current proposal and full baseline; otherwise `none` or an explicit unknown.

### Analyze: always read-only

```text
Delegate to snyk-expert.
Operation: analyze; request source: <human request locator>.
Installed resource root: <canonical isolated installation root>.
Target/report/read scope: <complete bound scope record above>.
Evidence: <authorized inert report and supplied graph/scan/runtime locators>.
Write/code-execution authority: none; consume supplied observations only.
Approval: none. Return findings, owner proposals, compatibility/gaps and
planned checks; zero target writes, even for compatible patch/minor.
```

### Remediate: eligible subsets first, deferred work visible

```text
Delegate to snyk-expert.
Operation: remediate; installed resource root: <canonical installed root>.
Scope/baseline/report/graph/scan: <complete current record with exact hashes>.
Existing policy: <human-authorized documented compatible patch/minor policy>.
Allowed files/fields and execution/network/output boundary: <exact records>.
Required build/runtime/scanner probes and rollback owner: <authorized records>.
Approval: none for gated intent. Present evidence-backed eligible proposals
and separate gates/blockers first. Apply independent eligible owner sets one
at a time under policy; verify each. Defer major/breaking/uncertain proposals.
Return complete results and updated baseline for any later approval.
```

Maven/Spring ownership follows effective parents/properties/BOM order, child pins, profiles/modules, internal owners and coupled artifact families. Package reporting is separate from owner changes: two package groups can require more than two edits. Preserve each source record/alias, duplicate occurrence, ordered path and unknown field; HTML is inert data, not active content, shell instruction or approval. Reconcile structured/HTML disagreement and stale graph/scope explicitly. Do not preselect a Boot major or report-suggested fixed version.

### Exact human gate and re-delegation

1. Specialist returns a ready proposal to main before gated writes. Include proposal/material-intent identities; exact owner/artifact old → new versions; files/fields/coupled edits; covered/uncovered finding/occurrence/path/module/profile scope; full current baseline; official evidence/gaps/risks/alternatives; planned graph/build/runtime/rescan and safe rollback owner.
2. Main presents that exact proposal and asks the human to approve, reject or revise. Retain identifiable decision source/evidence and precise conditions; no fabricated transcript or specialist self-approval.
3. Main re-delegates the record below. Reject means no gated edit; revise/unclear/changed conditions require a new proposal and decision. Before each approved owner set, recheck the full baseline and exact intent. Relevant root/HEAD/index/worktree/file, module/profile, report/scan/policy, scope/owner/version or intent drift voids approval; preserve user work and re-gate.

```text
Delegate to snyk-expert.
Operation: approved-remediate; installed resource root: <canonical root>.
Current complete delegation record: <current observed scope/baseline/evidence>.
Human decision: approve | reject | revise/unclear.
Decision source: <identifiable human evidence locator/hash>.
Proposal: <exact proposal and material-intent identities/hashes>.
Approved baseline: <full tuple, including state after prior eligible edits>.
Authorized intent: <old/new owner/artifacts, paths/fields, coupled edits,
covered findings/paths/modules/profiles, limits and out-of-scope items>.
Reason/checks/rollback/conditions: <exact approved evidence and requirements>.
Revalidate; execute only a matching approve with all other gates satisfied.
```

A mixed run that has applied eligible sets returns overall `partial` and next action `needs-approval` for deferred exact intent against its **updated** baseline. Before execution, a ready exact human gate is `needs-approval`; a missing prerequisite preventing required execution is `blocked`. Completed read-only analysis is `analyzed`; started but incomplete work/checks are `partial`. `completed` requires all authorized actions/checks and resolution or explicit human acceptance of new risks; it does not imply every finding is fixed.

Keep each finding's source assertion, baseline observation, post-scan observation and disposition separate. `fixed` needs baseline presence plus verified resolved graph, affected consumer runtime and comparable same-scope rescan for every claimed path/module/profile. Preserve `remaining`, `newly-introduced`, `blocked` and `unverified`. Snyk exits 0/1 are completed scan outcomes, 2/3 or project errors/omissions are incomplete evidence; disappearance under changed scope/policy/database is not a credited fix. No automatic suppression, deployment, monitor upload, commit/push or external private-report upload is implied.

## Reuse the composition recipe

1. Pick one specialist decision owner and focused agent description. Keep the prompt to loading, operations, transitions, human gate and completion evidence.
2. Decompose independently useful task skills; reuse equivalents instead of duplicating them. Put ecosystem/tool detail in each skill's references, not the agent. This [upgrade review](.claude/skills/dependency-upgrade-review/SKILL.md) works without a Snyk report and never mutates.
3. Declare native skill preloads; require child-local entrypoint and reference reads from the installed resource root. Native body loading, reference reading and explicit-read fallback are separate evidence; parent context is not inheritance proof.
4. Define inputs, exact scope/baseline, operation, state transitions, human decision record and final evidence before edits. Main owns human decisions and effective permissions; the specialist cannot manufacture either.
5. Use explicit delegation as the reliable request form; qualify actual discovery/preload rather than promising model routing.
6. Exercise compatible/gated/rejected/drift/missing-evidence/failure cases in isolation. Real remediation needs real graph/build/runtime/comparable-scan proof; constructed cases only prove their bounded behavior.
7. Reuse for another domain by changing the specialist's domain contract and procedures, not copying Snyk details or creating an actor/workflow skill, routing engine or generator. Record tested version, limits and unresolved prerequisites honestly.

## Live qualification prerequisites

Phase 05 still requires the original report/matching structured data; authorized target/revision/modules/profiles and affected-consumer runtime probes; scanner/version/org/policy/credential/registry access; deployed Claude configuration and actual loading/permission evidence. Store private artifacts only at authorized secure locations. This bundle supplies no keys, environment secrets, scanner installation, global publication or substitute live target.

Official authoring references: [Claude subagents/preloads](https://code.claude.com/docs/en/sub-agents), [skills](https://code.claude.com/docs/en/skills), [permissions](https://code.claude.com/docs/en/permissions), [sandboxing](https://code.claude.com/docs/en/sandboxing). Current docs guide authoring; deployed runtime evidence decides support.
