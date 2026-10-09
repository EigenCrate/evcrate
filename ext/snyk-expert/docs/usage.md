# Snyk expert: common `.agents` bundle

## Install

The package installs portable instructions, not Snyk itself. Run from a consuming project:

```bash
npx @evcrate/snyk-expert --target /path/to/project --dry-run
npx @evcrate/snyk-expert --target /path/to/project
# From this checkout:
node ext/snyk-expert/bin/install.js --target /path/to/project
```


Installation requires trusted exclusive ownership of the destination tree. Symlink/collision checks are preflight checks, not an adversarial race-proof sandbox; another writer changing paths after planning can invalidate them. Keep concurrent writers out of the installation boundary. No concurrency-safety qualification is claimed.
These are usage templates, not a claim of npm publication. Local checkout execution works without registry publication. Installer destinations are always project-local `.agents`, never a target-specific folder. Defaulting to HOME is refused; `--target` is the project root, not the `.agents` folder. Identical resources are skipped; differing files require `--force` and interactive confirmation or `--force --yes`. `--yes` alone is rejected. Dry-run writes nothing. Unrelated files are untouched; legacy `.claude` installations trigger migration warnings without automatic deletion; symlink escapes and leaf symlinks are blocked. Each file is staged/verified/renamed; a multi-file install is not a transactional rollback guarantee.

## Resources and host loading

```text
.agents/
  agents/snyk-expert.md
  skills/
    snyk-cli/SKILL.md
      references/cli-workflow.md
    snyk-fix/SKILL.md
      references/finding-and-owner-contract.md
      references/maven-spring-remediation.md
      references/node-typescript-remediation.md
      references/verification-and-results.md
    dependency-upgrade-review/SKILL.md
      references/compatibility-evidence.md
      references/review-output.md
```

A host supporting `.agents/skills` can discover skills according to its own contract. `.agents/agents/snyk-expert.md` is portable specialist instruction text, not universal native subagent registration. If discovery or registration is unavailable, explicitly read the specialist and selected entrypoint plus all required references in the executing context. Configure host integration separately; no target-specific adapter or permissions are installed. A parent-read body is not proof of child reference consumption.

The package bundle contains exclusively `.agents/` resources; legacy `.claude/` resources have been removed from the package. This packaged guide and the package README document the current contract.

## Workflow from CLI, not only HTML

1. **Setup:** explicitly request `snyk-cli` setup. Inspect installed executable/version/help; if absent, return an operator-authorized pinned installation plan. The human performs browser login through `snyk auth`; CI injects `SNYK_TOKEN` securely. Never paste a token into chat, argv, evidence, configuration dumps or debug logs. Installation/authentication/configuration authority is separate from target scan authority.
2. **Scan:** explicitly bind target root, package-manager/version/workspaces/lockfile, SCA or Code product, organization/endpoint, network/data-transmission and safe artifact paths. Node/TypeScript dependencies use `snyk test`; source analysis uses `snyk code test` under separate source-upload authority. Capture each exit and expected project result. Exit 1 means completed findings, not command failure. Exit 2/3, omissions or malformed output are incomplete evidence.
3. **Evidence:** preserve JSON/SARIF from distinct baseline/post and SCA/Code paths. HTML is optional; use deployed version-supported native HTML or an explicitly authorized converter. Do not chain conversion behind scan success and lose exit-1 findings. A clean Code scan can omit JSON; the CLI procedure records that product-specific limit without inventing a file.
4. **Analyze:** load `snyk-fix` and the relevant Maven or Node procedure. Inertly account for every supplied source record/path, map controlling owners and assess exact candidates with `dependency-upgrade-review`. Zero target edits in analyze mode. Source-code SAST findings are not dependency upgrade proposals.
5. **Remediate:** only authorized compatible patch/minor sets under existing policy; major, breaking, uncertain or scope-changing intent needs an exact parent-collected human decision tied to the current full baseline. Node changes preserve dependency sections, workspace control and generated lockfiles; no blanket `npm audit fix`, `snyk fix`, overrides, package-manager migration or latest-version upgrades.
6. **Verify:** prove resolved graph, build/tests, installed TypeScript compiler checks, actual affected runtime behavior and comparable same-scope rescan. Capture updated baseline after each coherent owner set; drift voids approval. No scan/runtime proof means unverified, not fixed.

## Explicit requests

Fill values from authorized observation. These are delegation templates, not execution or approval records.

```text
Read /absolute/project/.agents/agents/snyk-expert.md.
Operation: setup.
Installed resource root: /absolute/project.
Approved setup scope: inspect existing executable/version/help only.
Installation/configuration/credential-state mutation: none.
Return missing prerequisites and human login instructions; do not inspect secrets.
```

```text
Read /absolute/project/.agents/agents/snyk-expert.md.
Operation: scan; product: Open Source (SCA).
Installed resource root: /absolute/project.
Target root/repository/revision: <explicit canonical target and full baseline>.
Package manager/version, manifest, shared lockfile and workspaces: <observed scope>.
Organization/endpoint/policy and dev dependency scope: <exact authorized values>.
Executable/cwd/argv, network/registry and transmission authority: <exact boundary>.
Artifact outputs: <private non-colliding baseline paths>; target dependency writes: none.
Authentication: operator-provided runtime injection; no credential material in result.
Return command exits, each expected project result, artifact identities and coverage gaps.
```

For remediation pass the full [finding/owner contract](../.agents/skills/snyk-fix/references/finding-and-owner-contract.md), [review inputs](../.agents/skills/dependency-upgrade-review/SKILL.md), and [verification/result contract](../.agents/skills/snyk-fix/references/verification-and-results.md). HTML is not required if an authorized CLI baseline supplies original structured evidence. Report-read authority never grants builds, lifecycle scripts, scanner installation, source upload or dependency changes.

## Qualification and security limits

The bundle supplies procedures and a copier. It supplies no keys, authenticated target, approved scope, registry access, scanner installation, live findings or universal host permission sandbox. Prompt/tool lists are not filesystem isolation. Do not use permissive host modes to continue. No monitor, `--report`, suppression, deployment, external report upload, commit, push or npm publication is implied.

Current official Snyk documentation supports browser OAuth defaults from CLI 1.1293 and native HTML from 1.1308; verify actual deployed help and product/version support. Node package-manager support evolves; the procedures require scope/version checks, especially pnpm. Official contracts: [auth](https://docs.snyk.io/developer-tools/snyk-cli/commands/auth), [test](https://docs.snyk.io/developer-tools/snyk-cli/commands/test), [code test](https://docs.snyk.io/developer-tools/snyk-cli/commands/code-test), [installation](https://docs.snyk.io/developer-tools/snyk-cli/install-the-snyk-cli).
