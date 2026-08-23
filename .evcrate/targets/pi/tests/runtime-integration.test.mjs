import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const piVersion = "0.84.1";

function run(command, args, options = {}) {
  return execFileSync(command, args, { encoding: "utf8", stdio: "pipe", timeout: 120_000, ...options });
}

function rpcCommands(runtime, home, args = [], environment = {}) {
  const result = spawnSync(runtime.command, [...runtime.args, "--mode", "rpc", "--no-session", "--no-context-files", ...args], {
    cwd: home,
    encoding: "utf8",
    input: '{"id":"commands","type":"get_commands"}\n',
    timeout: 120_000,
    killSignal: "SIGKILL",
    env: {
      ...process.env,
      ...environment,
      HOME: home,
      PI_OFFLINE: "1",
      PI_SKIP_VERSION_CHECK: "1",
      PI_TELEMETRY: "0",
    },
  });
  assert.equal(result.status, 0, result.error?.message ?? result.stderr);
  const response = result.stdout.split("\n").filter(Boolean).map(JSON.parse)
    .find((entry) => entry.id === "commands");
  assert.equal(response?.success, true, result.stdout);
  return response.data.commands;
}

function installPi(root) {
  const prefix = join(root, "pi-runtime");
  run("npm", ["install", "--prefix", prefix, "--ignore-scripts", "--no-audit", "--no-fund", `@earendil-works/pi-coding-agent@${piVersion}`]);
  const packageRoot = join(prefix, "node_modules/@earendil-works/pi-coding-agent");
  const installed = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
  assert.equal(installed.version, piVersion);
  return { command: process.execPath, args: [join(packageRoot, "dist/cli.js")] };
}

function installManagedPackages(runtime, home) {
  for (const source of [
    "npm:pi-subagents@0.44.0",
    "npm:@juicesharp/rpiv-ask-user-question@2.4.0",
    "npm:@juicesharp/rpiv-todo@2.4.0",
  ]) {
    run(runtime.command, [...runtime.args, "install", source], {
      cwd: home,
      env: { ...process.env, HOME: home, PI_SKIP_VERSION_CHECK: "1", PI_TELEMETRY: "0" },
    });
  }
  const packageRoot = join(home, ".pi/agent/npm");
  const installed = readdirSync(packageRoot, { recursive: true })
    .filter((path) => path.endsWith("package.json"))
    .map((path) => JSON.parse(readFileSync(join(packageRoot, path), "utf8")));
  const managed = installed
    .filter(({ name }) => [
      "pi-subagents",
      "@juicesharp/rpiv-ask-user-question",
      "@juicesharp/rpiv-todo",
    ].includes(name))
    .map(({ name, version }) => `${name}@${version}`);
  assert.deepEqual(new Set(managed), new Set([
    "pi-subagents@0.44.0",
    "@juicesharp/rpiv-ask-user-question@2.4.0",
    "@juicesharp/rpiv-todo@2.4.0",
  ]));
}

test("packed distribution builds, publishes, and Pi discovers native commands and skills", { timeout: 180_000 }, () => {
  const root = mkdtempSync(join(tmpdir(), "evcrate-pi-runtime-"));
  try {
    const packDirectory = join(root, "pack");
    const installRoot = join(root, "installed");
    const home = join(root, "home");
    const state = join(root, "state");
    mkdirSync(packDirectory);
    run("npm", ["pack", "--pack-destination", packDirectory, "--ignore-scripts"], { cwd: projectRoot });
    const tarball = join(packDirectory, readdirSync(packDirectory).find((name) => name.endsWith(".tgz")) ?? "");
    assert.ok(existsSync(tarball), "npm pack did not create a tarball");
    run("npm", ["install", "--prefix", installRoot, "--ignore-scripts", "--no-audit", "--no-fund", tarball]);
    const packageName = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8")).name;
    const packedRoot = join(installRoot, "node_modules", packageName);
    assert.ok(existsSync(join(packedRoot, "migrate_claude_to_pi.py")));
    run("python3", ["distribute.py", "--build"], { cwd: packedRoot });
    run("python3", ["distribute.py", "--check"], { cwd: packedRoot });
    run("python3", ["distribute.py", "--publish"], {
      cwd: packedRoot,
      env: { ...process.env, EVCRATE_HOME: home, EVCRATE_STATE_HOME: state },
    });

    const pi = installPi(root);
    installManagedPackages(pi, home);
    const commands = rpcCommands(pi, home);
    const names = new Set(commands.map((command) => command.name));
    for (const name of ["plan", "fix:fast", "cook:auto:fast"]) assert.ok(names.has(name), name);
    assert.ok(names.has("skill:planning"), "generated Pi skills were not discovered");
    assert.equal(readdirSync(join(home, ".pi/agent/agents")).filter((name) => name.endsWith(".md")).length, 18);

    const isolated = rpcCommands(pi, home, ["--no-skills", "--skill", join(home, ".pi/agent/skills")]);
    assert.ok(isolated.some((command) => command.name === "skill:planning"));
    const alternateAgent = join(root, "alternate-pi/agent");
    cpSync(join(home, ".pi/agent"), alternateAgent, { recursive: true });
    const alternate = rpcCommands(pi, home, ["--no-extensions", "-e", join(alternateAgent, "extensions/evcrate/index.js")], {
      PI_CODING_AGENT_DIR: alternateAgent,
    });
    assert.ok(alternate.some((command) => command.name === "plan"));
    const settings = JSON.parse(readFileSync(join(home, ".pi/agent/settings.json"), "utf8"));
    assert.deepEqual(settings.packages, [
      "npm:pi-subagents@0.44.0",
      "npm:@juicesharp/rpiv-ask-user-question@2.4.0",
      "npm:@juicesharp/rpiv-todo@2.4.0",
    ]);
    assert.ok(!settings.packages.some((entry) => String(entry).includes("pi-code")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
