## Podman Docker Guidance

- On Fedora hosts, treat `podman` with `podman-docker` as sufficient for Docker-compatible checks. Do not require Docker Engine if `docker info`, `docker build`, and `docker run` work.
- Before concluding Docker is unavailable, ensure `XDG_RUNTIME_DIR=/run/user/$(id -u)` is exported in the shell running Codex.
- If needed, start the user socket with `systemctl --user start podman.socket` and prefer keeping it enabled for future sessions.
- When validating container availability, run both `docker info` and a real smoke check such as `docker run --rm hello-world` or a minimal `docker build`.
- If `docker` resolves to the Podman compatibility CLI, that is acceptable. The common failure mode is missing runtime environment, not missing Docker Engine.

## Subagent Completion Contract

Delegation is blocking by default. The parent agent must wait for each delegated agent's terminal response before starting dependent work, touching shared files, marking a step complete, or replying with a final result.

- Parallel prompt format: **spawn N agents; wait for all N to finish; collect one terminal result from each; then summarize**.
- Wait protocol: use the native agent wait/poll operation for the same agent set. **"No agents completed yet" is a non-terminal poll result; wait again.** Do not treat this as a timeout, sleep instead of polling, restart, interrupt, or advance the workflow.
- A polling interval or retry count is not a delegation deadline. Do not invent a wall-clock limit. Continue polling until a terminal result, explicit user stop, or an actual parent-runtime termination.
- Treat an interrupted, timed-out, missing, or partial result as a failed gate. Do not continue from partial output or silently restart it.
- Sequential prompt format: **run one agent; wait for its terminal response before continuing**.
- Every delegated prompt must define scope, file ownership, expected report, and validation signal.
- A spawn acknowledgement or file change does not mean completion; completion requires the terminal response and requested validation.
