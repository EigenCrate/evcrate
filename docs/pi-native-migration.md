# Native Pi migration

**Status:** Pi-specific projection guide  
**Updated:** 2026-09-13  
**Central contract:** [system architecture](./system-architecture.md)

This guide covers the Pi adapter and its user-owned settings boundary. General
controller policy, checkpoint wire format, publication, and command naming live in
the central architecture and are not duplicated here.

## Ownership and build

EVCrate authors commands, agents, workflows, hooks, scripts, and skills in
`.evcrate/source/.claude/`. The Pi target manifest is `.evcrate/targets/pi/manifest.json`;
its overlay root is `.evcrate/targets/pi/files`, output root is `.pi`, and the
shared settings fragment is `.pi/agent/evcrate/managed-settings.json`. The adapter
copies the overlay into the generated projection, normalizes canonical resources,
creates Pi inventories, and validates the result. Generated files are not
hand-edited: change canonical source or the Pi overlay, then rebuild.

After `npm run build`, the current TypeScript CLI can build/check the Pi target
without invoking a Python compatibility script:

```bash
# Build and check Pi target projection
node dist/cli/evcrate.js distribute build --target pi --json
node dist/cli/evcrate.js distribute check --target pi --json

# HOME publication (publishes to <home>/.pi)
node dist/cli/evcrate.js publish --dry-run --target pi --json
node dist/cli/evcrate.js publish --apply --target pi --json

# Project publication (publishes to <project>/.pi)
node dist/cli/evcrate.js publish --apply --scope project --project-root /path/to/project --target pi --json
```

`npm run distribute:pi` is the package's target-specific build-and-publish script;
use it only after reviewing a verified build and intended HOME changes. Publication
consumes only current verified output. For HOME scope, it binds local `.pi` to the
Pi HOME `<home>/.pi` root; for project scope, it binds to `<project-root>/.pi`.
The shared controller closure (`.evcrate/bin`) is always published under `--home`
(`<home>/.evcrate/bin`) and is never placed under `--project-root`.
`PI_CODING_AGENT_DIR` is a runtime configuration variable and does not change the
publisher destination. Native Windows validation remains pending.

Phase 09 installed Linux fixtures verify Pi projection materialization and runtime
entrypoint behavior. This evidence does not qualify a live Pi vendor CLI or
Windows runtime equivalence.

## Runtime model

The adapter copies command/workflow files recursively below the Pi EVCrate resource
root. The runtime helper derives its internal command name from the relative path
using colon separators (for example, the path `commands/fix/fast.md` has internal
name `fix:fast`). This is a Pi implementation detail; the repository documentation
convention still uses `/cmd-*` names. OMP's `__` filename flattening is not copied
into Pi output. Prefix enforcement across the canonical scanner and target runtimes
is a known follow-up; this documentation change does not rename source commands.

- `evcrate_command` performs bounded nested command expansion; static workflows
  remain Markdown documents.
- Generated agents retain semantic roles (`strong`, `standard`, `fast`, `parent`)
  rather than hard-coded model IDs. For `openai-codex`, current defaults map to
  Sol/high, Terra/high, and Luna/low; unknown providers inherit the parent model.
- `evcrate_subagent` uses the structured `pi-subagents` transport. Completion proves
  child execution, not parent acceptance; the parent still inspects artifacts and
  runs requested checks.
- The extension owns Pi lifecycle/tool-hook integration. Startup/new/resume/fork/
  reload map to canonical session context; manual and automatic compaction map to
  their explicit reasons; shutdown performs canonical cleanup without fabricating a
  Claude-only clear event.

Pi's generated inventory records checkpoint and inline advisory capabilities but
marks controller relay unsupported. The shared controller remains the only
checkpoint backend and uses `$HOME/.evcrate/bin/evcrate-advisor`.

## Managed packages and settings

Publication entry-merges exactly these pinned package identities into
`~/.pi/agent/settings.json` under the declared `packages` key:

- `npm:pi-subagents@0.44.0`
- `npm:@juicesharp/rpiv-ask-user-question@2.4.0`
- `npm:@juicesharp/rpiv-todo@2.4.0`

EVCrate does not own provider credentials, defaults, themes, sessions, UI
configuration, custom packages, user hooks, or `evcrate.modelRoles`. Package
upgrades require contract review. Malformed/symlinked settings or a concurrent HOME
change abort promotion. `pi-code` (including versioned/object forms) is a hard
conflict: remove it manually before a non-dry publish; EVCrate never removes it.
No-op, dry-run, and rollback preserve settings bytes.

### Optional model-role overrides

User-owned routes belong under `evcrate.modelRoles.providers`; EVCrate reads them
but never writes them. A route must name a model available from the same active
provider. Invalid or unavailable routes warn once and inherit the parent model.

```json
{
  "evcrate": {
    "modelRoles": {
      "providers": {
        "provider-id": {
          "strong": {"model": "provider-id/model", "thinking": "high"},
          "standard": {"model": "provider-id/model"},
          "fast": {"model": "provider-id/model", "thinking": "low"}
        }
      }
    }
  }
}
```

`parent` intentionally has no implicit route. Explicit per-delegation model or
thinking overrides remain authoritative when valid.

## Skills and launch isolation

Pi discovers both `.pi` and `.agents` skills. Same-name Pi skills normally win with
Pi's collision warning. To launch only EVCrate's Pi skills:

```bash
PI_CODING_AGENT_DIR="$HOME/.pi/agent" pi --no-skills --skill "$HOME/.pi/agent/skills"
```

Pi settings cannot portably exclude only `.agents` skills while retaining automatic
`.pi` discovery. The isolated launch is a runtime choice, not a publication setting.

## Troubleshooting

- **Missing command:** rebuild/check the Pi target with the TypeScript commands
  above. Inspect `.pi/agent/evcrate/commands/` and its generated inventory; do not
  edit that tree.
- **Pi extension root:** The installed extension derives the EVCrate root from its
  own installed location (`import.meta.url` / `__dirname`), ensuring that child
  commands and resources are resolved accurately without relying on `process.cwd()`.
  For isolated skill launches, a non-empty `PI_CODING_AGENT_DIR` configures the
  agent's runtime state root; otherwise the runtime derives `$HOME/.pi/agent` (or
  the platform home) with containment checks. It does not alter publisher destinations.
- **`pi-code` conflict:** remove the package manually, exit Pi processes that can
  write settings, review a dry run, then publish. It is never auto-removed.
- **Role warning or inherited child model:** verify the provider's route/model and
  the schema above. Unknown providers intentionally inherit.
- **Safety hook blocks a tool:** inspect the hook diagnostic and canonical policy;
  privacy/scout failures fail closed.
- **Skill collision warning:** use the isolated-skill launch above; `.agents` cannot
  be selectively excluded through Pi settings.

## Safe cutover and rollback

1. Run `npm run build`, target build/check, and disposable-HOME publication gates.
2. Remove `npm:pi-code` manually and exit Pi processes that can write sessions,
   packages, or settings.
3. Review `node dist/cli/evcrate.js publish --dry-run --target pi --json`.
4. Publish only while Pi is quiescent; then launch with the isolated-skill command
   when needed.
5. If promotion is interrupted, run the TypeScript `recover` action and restore any
   intentionally removed package entry manually. Do not auto-reinstall `pi-code`.

Live cutover remains user-controlled and requires explicit approval after isolated
validation evidence is reviewed. See the [project roadmap](./project-roadmap.md)
for release and support gates.
