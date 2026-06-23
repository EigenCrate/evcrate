## Migrated Claude Commands

- This devkit migrates Claude slash commands into `.agents/skills/cmd_*` skills rather than native `.codex/commands` entries.
- When a user asks for `/plan`, `/fix`, `/code`, `/test`, `/docs/update`, `/git/cm`, or similar, use the matching `cmd_*` skill.
- If a migrated recipe tells you to run another `/...` command, switch to the corresponding `cmd_*` skill for that path.

## Podman Docker Guidance

- On Fedora hosts, treat `podman` with `podman-docker` as sufficient for Docker-compatible checks. Do not require Docker Engine if `docker info`, `docker build`, and `docker run` work.
- Before concluding Docker is unavailable, ensure `XDG_RUNTIME_DIR=/run/user/$(id -u)` is exported in the shell running Codex.
- If needed, start the user socket with `systemctl --user start podman.socket` and prefer keeping it enabled for future sessions.
- When validating container availability, run both `docker info` and a real smoke check such as `docker run --rm hello-world` or a minimal `docker build`.
- If `docker` resolves to the Podman compatibility CLI, that is acceptable. The common failure mode is missing runtime environment, not missing Docker Engine.
