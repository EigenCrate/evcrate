# Native Pi migration

## Ownership and build

EVCrate authors commands, agents, workflows, hooks, scripts, and skills only in `.evcrate/source/.claude/`. `migrate_claude_to_pi.py` deterministically projects that source into `.evcrate/source/.pi`; the only Pi-authored runtime files are the extension overlay in `.evcrate/targets/pi/files/agent/extensions/evcrate/`.

Regenerate and verify without touching your live configuration:

```bash
python3 distribute.py --build
python3 distribute.py --check
```

The Pi target publishes only `EVCRATE_HOME/.pi` to `EVCRATE_HOME/.pi`. `PI_CODING_AGENT_DIR` is runtime-only: it may point Pi at another agent directory for a smoke test, but never changes the publisher destination.

## Runtime model

- Commands are registered recursively: `commands/fix/fast.md` becomes `/fix:fast`.
- `evcrate_command` performs bounded nested command expansion; static workflows remain Markdown documents, not executable JavaScript workflows.
- Generated agents retain semantic roles (`strong`, `standard`, `fast`, `parent`) rather than model IDs. For `openai-codex`, implicit routes are Sol/high, Terra/high, and Luna/low respectively. Unknown providers inherit the parent model; EVCrate never guesses a cross-provider route.
- `evcrate_subagent` uses the structured `pi-subagents` transport. A terminal response proves execution completed, not that the parent accepted the result. The parent must still inspect artifacts and run requested tests or review gates.
- The extension is the sole Pi lifecycle/tool-hook owner. It maps session start/resume/reload, manual/automatic compaction, prompt submission, tool pre/post events, and child delegation to the generated hook map. Pi has no equivalent for Claude's `SessionEnd: clear`; that clear-only canonical hook is not fabricated on shutdown.

## Managed packages and settings

Publication entry-merges exactly these pinned package identities into `~/.pi/agent/settings.json`:

- `npm:pi-subagents@0.44.0`
- `npm:@juicesharp/rpiv-ask-user-question@2.4.0`

It does not own provider credentials, defaults, themes, sessions, UI configuration, custom packages, user hooks, or `evcrate.modelRoles`. Package upgrades require contract-test review.

The publisher rejects malformed or symlinked settings and aborts promotion if the Pi HOME tree changes concurrently. No-op, dry-run, and rollback preserve settings bytes. `pi-code` (including versioned/object forms) is a hard conflict: remove it manually before a non-dry publish. EVCrate never removes it automatically.

## Skills and launch isolation

Pi discovers both `.pi` and `.agents` skills. Same-name Pi skills normally win with Pi's collision warning. To use only EVCrate's Pi skills:

```bash
pi --no-skills --skill "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/skills"
```

Pi settings cannot portably exclude only `.agents` skills while retaining automatic `.pi` skill discovery.

## Safe cutover and rollback

1. Run all build/check and temporary-HOME validation gates.
2. Remove `npm:pi-code` manually and exit every Pi process that could write sessions, packages, or settings.
3. Review `python3 distribute.py --publish --dry-run --json`.
4. Publish only while Pi remains quiescent, then start Pi with the isolated-skill command above.
5. If startup fails, use `python3 distribute.py --recover` and restore the previously removed package entry manually if needed. Do not auto-reinstall `pi-code`.

Live cutover remains user-controlled and requires explicit approval after isolated validation evidence is reviewed.
