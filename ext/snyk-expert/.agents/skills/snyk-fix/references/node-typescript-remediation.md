# Node.js and TypeScript remediation procedure

Executable-after-binding procedure for detecting package managers and lockfiles, tracing dependency owners, evaluating compatibility, applying coherent manifest and lockfile changes, and verifying resolution in Node.js and TypeScript projects.

## 1. Prerequisites and trust boundaries

- **Trusted-execution authorization**: Package managers (`npm`, `yarn`, `pnpm`), build scripts, test runners, local TypeScript compilers (`tsc`), and Snyk CLI can execute project code. Package manager installation triggers lifecycle scripts (`preinstall`, `install`, `postinstall`, `prepare`) that execute arbitrary code. Execution requires explicit caller authorization and a bounded host/process/network boundary. Missing authority before required execution starts is `blocked`; after started work it leaves `partial`.
- **Analyze mode constraint**: Zero target edits or target-writing commands, including dependency installs, lockfile regenerations, build caches, or scan compilations. Consume supplied evidence or separately authorized observations from an isolated copy; otherwise return exact unknowns. Apply overall status using [verification rules](verification-and-results.md), not the operation name alone.
- **Lifecycle scripts and install boundaries**:
  - **Script inspection before execution**: Inspect `package.json` `scripts` (e.g. `prebuild`, `build`, `postbuild`, `prepare`) and lifecycle hooks before running any install, build, or test command. If scripts perform external side effects (such as `postbuild` copying artifacts externally or invoking remote infrastructure), a general build is NOT a safe default check. Scope builds strictly (e.g. local compiler `tsc --noEmit` and targeted tests) or use `--ignore-scripts` where authorized.
  - Evaluate `--ignore-scripts` during installation if the operator boundary permits dependency updates without running arbitrary lifecycle code.
  - Reproducible install boundaries:
    - `npm ci`: Validates strict sync between `package.json` and `package-lock.json`. **Destructive to existing `node_modules`** (removes existing directory prior to install); execute only within disposable, authorized CI or container boundaries.
    - Yarn Classic (v1): `yarn install --frozen-lockfile` (fails if lockfile requires modification).
    - Yarn Modern (Berry v2+): `yarn install --immutable` rejects lockfile changes; cache immutability requires separately authorized `--immutable-cache`.
    - pnpm: `pnpm install --frozen-lockfile` (fails if `pnpm-lock.yaml` is out of sync).
- **Snyk CLI integration**: Scanner acquisition, operator authorization, installation, authentication (browser OAuth, CI tokens), global flags, and general artifact/exit capture are owned by [Snyk CLI execution workflow](../../snyk-cli/references/cli-workflow.md). This procedure governs Node.js/TypeScript-specific dependency resolution, package manager scope, manifest/workspace scanning commands, and coverage gates.
- **Primary documentation**:
  - [Snyk CLI for JavaScript](https://docs.snyk.io/supported-languages/supported-languages-list/javascript/snyk-cli-for-javascript)
  - [Snyk CLI test command](https://docs.snyk.io/developer-tools/snyk-cli/commands/test)
  - [Snyk CLI code-test command](https://docs.snyk.io/developer-tools/snyk-cli/commands/code-test)
  - [npm install](https://docs.npmjs.com/cli/v10/commands/npm-install) and [npm ci](https://docs.npmjs.com/cli/v10/commands/npm-ci)
  - [npm overrides](https://docs.npmjs.com/cli/v10/configuring-npm/package-json#overrides) and [npm workspaces](https://docs.npmjs.com/cli/v10/using-npm/workspaces)
  - [Yarn Classic selective resolutions](https://classic.yarnpkg.com/en/docs/selective-version-resolutions/) and [Yarn Berry manifest](https://yarnpkg.com/configuration/manifest#resolutions)
  - [pnpm add](https://pnpm.io/cli/add) and [current pnpm overrides](https://pnpm.io/settings/dependency-resolution#overrides); use version-matched documentation for older configurations.
  - [TypeScript compiler options](https://www.typescriptlang.org/tsconfig)
  - [Node.js packages entry points](https://nodejs.org/api/packages.html#packages_package_entry_points)
  - Online documentation is authoring evidence, not proof of deployed CLI/toolchain behavior. Verify installed versions and effective output before relying on a template.

## 2. Binding requirements

Before executing commands, bind the caller-supplied execution context:
1. `target_root`: Canonical absolute path to target project repository.
2. `package_root & manifest`: Exact path to `package.json`, its SHA-256 byte digest, and declared `scripts`.
3. `baseline_identity`: Full tuple in [finding contract](finding-and-owner-contract.md), including report/scan/policy/manifests/lockfiles and user changes, not HEAD/package.json hashes alone. Do not assume HEAD proves a clean worktree.
4. `dirty_state`: Snapshot of pre-existing staged, unstaged, and untracked workspace state before any command execution.
5. `package_manager`: Identified authorized package manager (`npm`, `yarn`, `pnpm`), major/minor version, and executable path.
6. `lockfile_identity`: Detected lockfile path, exact SHA-256 digest, and lockfile format version (`lockfileVersion` in `package-lock.json`, Yarn header, pnpm lockfileVersion).
7. `tool_versions`: Verified versions of Node runtime (`process.versions.node`), package manager, and local TypeScript compiler (`tsc`).
8. `workspace_root & topology`: Single-package repository or monorepo workspace; list of declared workspace packages and member `package.json` paths.
9. `output_dir`: Parent-approved private artifact directory; verify resolved path, permissions, and no collision/symlink escape. Use unique filenames per command/package/stage; do not expose sensitive registry tokens or credentials publicly.
10. `scan_scope`: Full observed scanner/version/organization/root/packages/options/policy/coverage identity, authorized development dependency scope (`--dev`), and authorized transmission boundary.

## 3. Package manager, lockfile, and workspace topology detection

Determine the controlling package manager, lockfile, and workspace graph before any operation:

1. **Package manager detection**:
   - Inspect `"packageManager"` field in root `package.json` (e.g. `"packageManager": "pnpm@9.1.0"` or `"yarn@4.1.1"`).
   - Inspect lockfiles present in `target_root`:
     - `package-lock.json` or `npm-shrinkwrap.json` -> npm; if both exist, shrinkwrap takes precedence. Bind the effective file rather than treating these as competing managers.
     - `yarn.lock` -> Yarn (check header: Classic `v1` vs Modern Berry metadata)
     - `pnpm-lock.yaml` -> pnpm (check `lockfileVersion`)
2. **Ambiguity and conflict stop**:
   - If multiple competing lockfiles exist in `target_root` (e.g. `package-lock.json` alongside `yarn.lock` or `pnpm-lock.yaml`), **STOP (`blocked`)**.
   - If `"packageManager"` conflicts with the observed lockfile, **STOP (`blocked`)**.
   - Do NOT guess the tool or perform an unapproved package manager migration.
3. **Workspace topology**:
   - npm/Yarn: `"workspaces"` field in root `package.json` (array or `{ packages: [...] }`).
   - pnpm: `pnpm-workspace.yaml` in `target_root` defining `packages` glob list.
   - Enumerate actual declared member paths, not an assumed `packages/<name>` layout. Map each declaring workspace and root catalogs/override/resolution fields; bind shared-versus-per-project lockfile settings.
4. **Dependency source classification**:
   - Distinguish manifest sections:
     - `dependencies`: Production runtime dependencies; deployed to production.
     - `devDependencies`: Development, build, test, and type definition dependencies.
     - `optionalDependencies`: Optional runtime dependencies.
     - `peerDependencies`: Host requirements; inspect `peerDependenciesMeta` for optionality.
     - `transitive`: Unlisted indirect dependencies resolved into lockfile by direct or other transitive dependencies.
     - `workspace`: Internal monorepo references (`workspace:*`, `workspace:^`, or path-linked).
5. **Direct owner preference, path tracking, and baseline comparability**:
   - Direct manifest dependency upgrade is always preferred over transitive overrides.
   - If a vulnerability resides in a transitive dependency, first investigate whether upgrading the declaring direct parent brings a fixed transitive version.
   - **Full ordered dependency path accounting**: Map every reported occurrence and full ordered dependency path back to its owning direct dependency in `dependencies` or `devDependencies`. Explicitly distinguish "this path is gone" (e.g. an intermediate path was pruned or removed by an update) from "this advisory is fixed" (which requires baseline presence + verified graph + verified runtime probe + matching post-scan proof). When an update removes some paths but leaves others (e.g. 5 paths disappear from Rimraf, but 27 vulnerable paths remain across 9 advisory IDs), record exact per-path and per-advisory dispositions.
   - **Comparable lockfile baseline**: Establish a comparable lockfile baseline. Reject manifest-only scans distorted by stale or ignored `node_modules`. A usable baseline scans the effective lockfile (`package-lock.json`) with the package manager and authorized development dependencies included (`--dev`). Development-dependency inclusion must match the authorized scope; if adding `--dev` changes the supplied report's scope, explicitly authorize and record a new baseline. Distinguish the lockfile graph from the installed graph: stale `node_modules` is conflicting evidence, not permission to delete or reinstall it without isolated execution authority.
   - Selective overrides (npm root `overrides`, Yarn root `resolutions`, version-supported pnpm override settings) require exact reviewed selectors and compatibility across their full consumer scope.
6. **Prohibited blanket actions**:
   - **NEVER** run `npm audit fix` or `npm audit fix --force` (performs unreviewed major semver jumps, breaking manifest/lockfile integrity).
   - **NEVER** run `snyk fix` or automated unattended CLI fixers.
   - **NEVER** upgrade to unpinned `latest` releases without specific candidate version bounds and compatibility review.
   - **NEVER** manually edit generated lockfiles (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`) by hand. Lockfiles contain integrity hashes (`sha512`), resolution URLs, and nested graph structures; hand-edits cause corruption and reproducibility failures. Lockfile updates must occur exclusively via authorized package manager execution.

## 4. Concrete command templates

These are templates, not executed evidence. Bind literal argv through an argv-array launcher (`shell: false`), cwd=`target_root`, bounded output and exit capture. `tool` is the authorized executable; `ws` is the target workspace name/path; `pkg` is the package name; `candidate` is the exact resolved target version. Omit only options evidenced as inapplicable; never execute angle-bracket placeholders.

### Graph inspection commands

| Tool | Target scope | Bound argv template |
|---|---|---|
| npm | Root / single project | `[tool, "ls", pkg, "--all", "--json"]`; retain full authorized tree separately with `[tool, "ls", "--all", "--json"]` |
| npm | Workspace | `[tool, "ls", "--workspace=" + ws, pkg, "--all", "--json"]` |
| Yarn Classic | All / single | `[tool, "why", pkg]` |
| Yarn Modern | Workspace paths | `[tool, "why", "-R", pkg]` when supported by installed help; inspect applicable peer/virtual locators |
| pnpm | Single project | `[tool, "why", pkg, "--json"]` |
| pnpm | Monorepo recursive | `[tool, "why", "-r", pkg, "--json"]` |
| pnpm | Workspace filtered | `[tool, "--filter", ws, "why", pkg]` |

Capture exits and full outputs. `npm ls` can return nonzero with an invalid/missing peer tree; retain and diagnose it, not success or discarded evidence. A one-package query is not complete owner/path coverage. Supported duplicate versions may legitimately coexist; do not dedupe as an incidental safety measure.

### Scoped update templates (exact versions, preserving section semantics)

| Manager | Section & Scope | Bound argv template |
|---|---|---|
| npm | Prod runtime | `[tool, "install", "--save-exact", pkg + "@" + candidate]` |
| npm | Dev dependency | `[tool, "install", "--save-dev", "--save-exact", pkg + "@" + candidate]` |
| npm | Optional dependency | `[tool, "install", "--save-optional", "--save-exact", pkg + "@" + candidate]` |
| npm | Workspace prod | `[tool, "install", "--workspace=" + ws, "--save-exact", pkg + "@" + candidate]` |
| npm | Workspace dev | `[tool, "install", "--workspace=" + ws, "--save-dev", "--save-exact", pkg + "@" + candidate]` |
| Yarn Classic | Prod runtime | `[tool, "add", pkg + "@" + candidate, "--exact"]` |
| Yarn Classic | Dev dependency | `[tool, "add", pkg + "@" + candidate, "--dev", "--exact"]` |
| Yarn Classic | Workspace prod | `[tool, "workspace", ws, "add", pkg + "@" + candidate, "--exact"]` |
| Yarn Classic | Workspace dev | `[tool, "workspace", ws, "add", pkg + "@" + candidate, "--dev", "--exact"]` |
| Yarn Modern | Prod runtime | `[tool, "add", pkg + "@" + candidate, "-E"]` |
| Yarn Modern | Dev dependency | `[tool, "add", pkg + "@" + candidate, "-D", "-E"]` |
| Yarn Modern | Workspace prod | `[tool, "workspace", ws, "add", pkg + "@" + candidate, "-E"]` |
| Yarn Modern | Workspace dev | `[tool, "workspace", ws, "add", pkg + "@" + candidate, "-D", "-E"]` |
| pnpm | Prod runtime (root) | `[tool, "add", "--save-exact", pkg + "@" + candidate]` (monorepo root: add `"-w"`) |
| pnpm | Dev dependency (root) | `[tool, "add", "-D", "--save-exact", pkg + "@" + candidate]` (monorepo root: add `"-w"`) |
| pnpm | Workspace prod | `[tool, "--filter", ws, "add", "--save-exact", pkg + "@" + candidate]` |
| pnpm | Workspace dev | `[tool, "--filter", ws, "add", "-D", "--save-exact", pkg + "@" + candidate]` |

Templates pin the candidate exactly. A range/alias-to-pin selector change is part of explicit reviewed intent, not normalization. Preserve dependency sections; npm prod updates bind `--save-prod` where inference could retain dev/optional classification. Optional/peer update flags must be confirmed by installed-version help. Peer ranges and `peerDependenciesMeta` require reviewed host-consumer scope, not ordinary runtime pinning. Unsupported section/version combinations stop; never silently move sections.

### Transitive override declarations (effective root configuration followed by install)

- **npm (npm 8+)**: Add exact scoped override under `"overrides"`:
  ```json
  {
    "overrides": {
      "transitive-pkg": "candidate-version"
    }
  }
  ```
  Or scoped to a direct parent:
  ```json
  {
    "overrides": {
      "parent-pkg": {
        "transitive-pkg": "candidate-version"
      }
    }
  }
  ```
  Followed by bound `[tool, "install"]`.
- **Yarn (Classic and Modern)**: Add exact resolution under `"resolutions"`:
  ```json
  {
    "resolutions": {
      "transitive-pkg": "candidate-version"
    }
  }
  ```
  Followed by bound `[tool, "install"]`.
- **pnpm**: Bind the deployed version's actual supported location. Current pnpm uses root `pnpm-workspace.yaml`; older versions may support root `package.json` `pnpm.overrides`. Do not add a second ineffective config or migrate formats. A current supported template is:
  ```yaml
  overrides:
    "parent-pkg>transitive-pkg": "candidate-version"
  ```
  Follow with bound `[tool, "install"]`. Catalog-owned versions require exact catalog-field intent and all consuming workspaces in scope. Unrelated generated graph churn stops dependent writes for assessment.

## 5. Coupled families, type definitions, and ecosystem constraints

- **Source assertions**: Vulnerability IDs, paths, and fixed version claims from supplied reports are unverified source assertions. Verify actual presence in current lockfile and manifest graph.
- **No version preselection**: Do not hardcode candidate versions. Query authorized registry metadata (`npm view <pkg> versions --json`) at runtime within authorized network boundaries.
- **TypeScript and `@types/*` companion coupling**:
  - When upgrading runtime package `foo`, check whether `@types/foo` is declared in `devDependencies`.
  - Bundled declarations: Determine whether existing `@types/foo` still augments APIs or conflicts. Removal is never automatic: it requires separately reviewed exact scope/intent and approval for changed behavior/scope.
  - Unbundled declarations: Verify upstream-supported combinations; declaration and runtime release numbers need not match.
  - TypeScript compiler compatibility: Verify candidate types do not require a newer TypeScript compiler syntax than the project's installed compiler.
- **Node engine and module format coupling**:
  - `engines.node`: Check candidate against target Node.js runtime support; flag dropped LTS versions.
  - ESM vs CommonJS: Check target Node version, synchronous ESM support, top-level await and conditional exports. Modern Node can `require()` some synchronous ESM; assume neither universal compatibility nor universal `ERR_REQUIRE_ESM`. Exercise the deployed consumer without introducing shims.
  - Subpath exports: Check target import statements against candidate package `"exports"` map. Removed or unexported subpaths will fail with `ERR_PACKAGE_PATH_NOT_EXPORTED`.
- **Native addons and ABI compatibility**:
  - Packages using native C/C++ or Rust bindings (`node-gyp`, `@napi-rs/*`, prebuilds) must match the target Node runtime ABI, OS, libc (`glibc` vs `musl`), and CPU architecture (`x64`, `arm64`). Incompatible native bindings cause `ERR_DLOPEN_FAILED`.
- **Monorepo coupled families**:
  - Coordinated families use upstream-supported combinations across affected workspaces, not presumed identical artifact versions.
- **Coupled testing and coverage suites**:
  - When evaluating test runners and companion coverage providers (such as `vitest` and `@vitest/coverage-v8`, which require identical matched versioning such as `vitest@4.0.0` and `@vitest/coverage-v8@4.0.0`), both packages must be updated together as a coupled owner pair.
  - Candidate versions cited in proposals or reports are illustrative; verify registry availability, official release notes, `engines`, peers, licensing, and major transitive shifts before proposing. Major version jumps remain approval-gated.

## 6. Upstream review and owner vs override comparison

Consume a read-only assessment through [Dependency Upgrade Review](../../dependency-upgrade-review/SKILL.md) in this context; no nested-agent dependency:
1. Compare an exact supported direct dependency upgrade against a documented selective override. Include all affected consumers across workspaces, not only vulnerable children.
2. Verify that proposed candidate versions and companion `@types/*` or peer packages exist in the authorized registry.
3. Preserve `eligible`, `needs-approval`, `blocked` assessment reasons. Missing artifact/access is blocked; unclosed compatibility gaps (e.g. ESM break, engine bump, peer conflict) require human approval; no forced upgrade or unverified fallback.

## 7. Pre-edit gates and coherent edit execution

1. **Procedure existence enforcement**: Confirm single-writer access, verify baseline has not drifted from delegation record, snapshot pre-existing user changes (staged, unstaged, untracked), and enforce that a concrete procedure exists and is validated **before ANY owner update**. Applying an ad-hoc update to an earlier owner (such as updating Rimraf without an established procedure) while postponing the stop to a subsequent owner (such as Vitest) is strictly forbidden. If an ecosystem procedure does not exist, stop (`blocked`) prior to any target modification.
2. **Operation gating**:
   - `analyze`: Stop before write; output read-only proposal.
   - `remediate`: Apply only if proposal is assessed `eligible` under current user policy and ecosystem procedure is validated.
   - `approved-remediate`: Eligible sets retain their own gates; gated intent additionally requires exact human decision/source, proposal/intent hashes, full current baseline, covered paths, and conditions from the finding contract. Human approval binds strictly to the exact owner set and current baseline; approval for one owner pair (e.g. Vitest/coverage) cannot supply a missing procedure, cannot extend to other owners, and is voided if the baseline drifts. Rebind approval to the current package and lockfile state before considering the next owner set.
3. **Coherent edit execution**:
   - Apply manifest edits to target `package.json` (root or workspace).
   - Execute authorized package manager update command within authorized boundary to synchronize the lockfile.
   - Never edit lockfiles by hand.
   - Record owned hunks and before/after SHA-256 hashes of `package.json` and lockfile.
   - Recheck baseline before any subsequent change set.

## 8. Verification, typechecking, build and concrete runtime probes

After modifying manifests and updating the lockfile, run verification:

1. **Effective graph check**:
   - Run package manager graph inspection (`npm ls`, `yarn why`, `pnpm why`) for the modified package.
   - Confirm exact candidate versions and covered paths/peer variants; diagnose new unresolved peer/install errors. Supported existing duplicates are not a reason to dedupe.
2. **Local installed typecheck compiler verification**:
   - **Strict prohibition**: **NEVER** run `npx tsc` without verifying local installation or in an unconstrained environment. `npx` can silently download arbitrary remote packages from the npm registry without operator authorization.
   - **Declared script execution**: Run the target's declared typecheck script via the authorized package manager:
     - npm: `[tool, "run", "typecheck"]`
     - Yarn: `[tool, "typecheck"]`
     - pnpm: `[tool, "run", "typecheck"]`
   - **Explicit local path execution**: If no script is declared, execute the locally installed TypeScript compiler binary directly:
     - `["node", "./node_modules/typescript/bin/tsc", "--noEmit"]` or `["./node_modules/.bin/tsc", "--noEmit"]`
   - Verify zero type errors across project and workspace packages.
3. **Target build and tests**:
   - **Pre-update test execution**: Execute tests before any edit to record baseline passing, failing, and skipped test counts (e.g. establishing whether failures such as 20 passing, 2 failing, 2 skipped are pre-existing vs newly introduced regressions). Never defer the initial test run until post-update.
   - **Script inspection before building**: If `package.json` contains `postbuild` or other scripts with external side effects (e.g. copying artifacts externally, deploying), do not run an unreviewed general `npm run build`; run focused compilation (`tsc --noEmit`) and safe test scripts.
   - Run target-approved build command (e.g. `npm run build` or focused compile).
   - Run target-approved test command (e.g. `npm test`).
4. **Concrete runtime probes**:
   - Process startup without exceptions is insufficient. Probes must exercise actual target code paths.
   - *Import/require probe*: Verify that upgraded package entrypoints load under the target Node runtime without `ERR_REQUIRE_ESM`, `ERR_PACKAGE_PATH_NOT_EXPORTED`, or module resolution failure.
   - *Native addon probe*: If the package contains native bindings, verify native library initialization without `ERR_DLOPEN_FAILED`.
   - *Behavioral probe*: Execute application paths utilizing the upgraded library and assert expected behavior.
5. **Probe failure stop**: If typecheck, build, tests, or runtime probes fail, **STOP (`partial`)**. Record failure details; initiate selective rollback of only owned edits if authorized.

## 9. Snyk scan invocation, manifest/workspace commands, and coverage gates

General Snyk CLI acquisition, operator authorization, authentication (browser OAuth, CI tokens), global flags, and baseline artifact conventions are defined in [Snyk CLI execution workflow](../../snyk-cli/references/cli-workflow.md). This section provides the concrete manifest and workspace scanning commands and mandatory coverage gates for Node.js and TypeScript repositories.

Run baseline and post-remediation scans with identical scope:

### Command templates
- **Shell schema**: `snyk test <captured-scope-options> --json-file-output="<safe-artifact>"`; replace each placeholder with separately quoted authorized literal arguments.
- **Argv**: `["snyk", "test", ...scanArgs, "--json-file-output=" + scanOutput]`. `scanArgs` is a list, not a joined string; use distinct baseline and post output paths.

### Manifest and workspace scanning commands

| Project type | Package manager | Scope & Target | Bound argv template |
|---|---|---|---|
| Single project | npm | Effective npm manifest/lockfile | `["snyk", "test", "--file=package.json", ...scanArgs, "--json-file-output=" + scanOutput]` |
| Workspaces | npm | Authorized discovery root | `["snyk", "test", "--all-projects", ...scanArgs, "--json-file-output=" + scanOutput]` |
| Single project | Yarn | Effective Yarn lockfile | `["snyk", "test", "--file=yarn.lock", ...scanArgs, "--json-file-output=" + scanOutput]` |
| Workspaces | Yarn | Supported workspace discovery | `["snyk", "test", "--yarn-workspaces", ...scanArgs, "--json-file-output=" + scanOutput]` or supported `--all-projects` |
| Single project | pnpm | Supported lockfile detection | `["snyk", "test", ...scanArgs, "--json-file-output=" + scanOutput]` from the bound pnpm root |
| Workspaces | pnpm | Supported multi-project detection | `["snyk", "test", "--all-projects", ...scanArgs, "--json-file-output=" + scanOutput]` only after deployed support/coverage is established |
| Selected workspace | Any supported manager | Observed supported shared-lockfile mapping | `["snyk", "test", "--file=" + wsManifestPath, ...scanArgs, "--json-file-output=" + scanOutput]` only if deployed scanner resolves that member against its actual manager/lockfile |

`scanArgs` contains exact organization/policy and explicitly authorized dev scope, not a universal `--dev`. Verify manager identity in results; nonstandard files need a documented deployed `--file`/`--package-manager` pair. Do not assume pnpm flags/lockfile/workspace support, or that a leaf manifest uses the shared root lockfile.

### Node.js and TypeScript coverage gates

Before crediting any scan result as valid evidence, evaluate these mandatory coverage gates:

1. **Lockfile synchronization gate**:
   - Compare scanner inputs with actual resolved graph and effective lockfiles. npm may inspect installed `node_modules`; other versions/managers may use lockfiles directly.
   - A missing/stale lockfile or incomplete installed tree needs an explicitly authorized rebaseline/graph acquisition. Do not claim every manifest-only scan is direct-only or clean; record actual coverage and gaps.
2. **Development dependencies parity gate (`--dev`)**:
   - Node.js and TypeScript repositories declare build tools, compilers (`typescript`), type declarations (`@types/*`), and test frameworks in `devDependencies`.
   - Bind deployed scanner's development dependency support per manager/version. npm/Yarn support `--dev`; verify actual pnpm coverage rather than assume identical flag behavior.
   - **Parity rule**: Baseline and post-remediation scans must have identical `--dev` inclusion. Dropping `--dev` post-remediation falsely conceals findings and invalidates the remediation claim.
3. **Monorepo workspace accounting gate**:
   - Inspect actual returned project objects/arrays and compare every expected authorized workspace against them; extra/missing targets and project `error`/parse failures are coverage gaps.
   - `ok: false` can mean vulnerabilities were found, not execution failure. Interpret finding records separately from explicit project errors; inspect exits and each object's product-specific schema.
4. **pnpm lockfile version and parser capability gate**:
   - Compare exact lockfile format and deployed scanner against [current JavaScript support](https://docs.snyk.io/supported-languages/supported-languages-list/javascript); a generic `5.x` assumption does not establish support.
   - Older Snyk CLI versions throw parser errors on newer pnpm lockfiles (exit 2). Ensure CLI compatibility or report scanner capability blocker; do not treat parser failure as zero findings.
5. **Code scan separation gate (SAST vs SCA)**:
   - `snyk test` performs Software Composition Analysis (SCA) on manifests and lockfiles.
   - `snyk code test` performs Static Application Security Testing (SAST) on application source code.
   - **Strict boundary**: Snyk Code findings are source code flaws, NOT dependency graph issues. Source findings must never be conflated with the dependency owner graph or remediated through dependency updates.
6. **JSON output and option restrictions**:
   - Output structured evidence via `--json-file-output="<safe-artifact>"`.
   - `--show-vulnerable-paths` is unsupported with `--json-file-output` and must be omitted.
7. **Exit code evaluation**:
   - `0`: Scan complete, no vulnerabilities detected.
   - `1`: Scan complete, vulnerabilities detected.
   - `2`: Execution error / scan failure.
   - `3`: No supported target projects discovered.
   - Exit 2, 3, or per-project errors in workspace scans indicate failed/incomplete evidence (`partial`), not clean results.
## 10. Stop branches summary

| Condition | Action / Status | Recovery Requirement |
|---|---|---|
| Missing authority / procedure / access | Stop that action; `blocked` before execution, `partial` after started work | Restore exact missing prerequisite; independent supported subsets keep separate gates |
| No validated procedure before owner update | Stop before any edit; `blocked` | Establish and validate dedicated ecosystem procedure before any owner edit; never apply ad hoc updates |
| Unsafe lifecycle scripts / postbuild side effects | Stop unreviewed general build; use focused typecheck/test | Scope build to safe local compilation (`tsc --noEmit`) and safe test scripts |
| Coupled suite version mismatch (e.g. runner/coverage) | Stop; update coupled packages together | Coordinate matched versions for coupled tools (e.g. `vitest` + `@vitest/coverage-v8`) |
| Stale / ignored node_modules distorting baseline | Reject manifest-only scan; establish clean lockfile baseline | Scan effective lockfile with matching `--dev` scope |
| Analyze operation | Zero target writes; `analyzed` only if analysis complete, otherwise blocked/partial | Return evidence and exact gaps; no target-writing command |
| Multiple / conflicting lockfiles | Stop before any edit; `blocked` | Resolve lockfile ambiguity; obtain single canonical package manager authority |
| Unapproved package manager migration | Stop before any edit; `blocked` | Preserve existing package manager; do not migrate tools or delete lockfiles |
| Relevant baseline drift | Void old assessment/approval; status follows actual work and prerequisites | Reassess current intent/state; obtain new exact decision only for gated work |
| Transitive finding with direct parent fix | Do not add override; prefer direct owner upgrade | Trace parent dependency, review exact parent upgrade through upgrade-review |
| Transitive override unreviewed / breaks consumers | Defer override; preserve blocker and human-gate reasons | Review impact across all consumers; obtain explicit human approval for override |
| Exact gated proposal lacks approval | No gated write; `needs-approval` before required execution, otherwise `partial` | Main collects exact current-baseline human decision |
| Local compiler / tsc missing | Stop typecheck; do not run unpinned `npx` | Verify local devDependencies install or obtain explicit compiler execution authority |
| Graph / typecheck / build / test / runtime failure | Stop dependent sets; `partial`, findings remaining/unverified as evidenced | Diagnose, preserve outputs and new risks; rollback only safely authorized owned hunks |
| Scanner failure (exit 2, 3, or workspace error) | Record failed / incomplete evidence; `partial` | Diagnose scanner error / flags; do not credit failed scan as fixed findings |
