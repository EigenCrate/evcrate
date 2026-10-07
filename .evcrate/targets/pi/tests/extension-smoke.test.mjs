import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createChildStartRunner, runChildStart } from "../files/agent/extensions/evcrate/child-context.js";
import {
  getAgentRoot,
  getInstalledAgentRoot,
  resolveEvcrateMarkers,
} from "../files/agent/extensions/evcrate/paths.js";
import {
  publishApply,
  publishDryRun,
  resolveInvocationContext,
} from "../../../../dist/index.js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const overlayExtensionDir = fileURLToPath(new URL("../files/agent/extensions/evcrate", import.meta.url));
const overlayPathsPath = fileURLToPath(new URL("../files/agent/extensions/evcrate/paths.js", import.meta.url));
const REQUIRED_ROOT_ERROR = "PI_CODING_AGENT_DIR or HOME is required to locate the Pi agent root";

function assertProcessHomeFallback(modulePath, home) {
  const script = [
    'const { homedir } = await import("node:os");',
    'const { resolve } = await import("node:path");',
    `const { getAgentRoot } = await import(${JSON.stringify(pathToFileURL(modulePath).href)});`,
    'const expected = resolve(homedir(), ".pi", "agent");',
    'if (resolve(getAgentRoot()) !== expected) process.exit(1);',
  ].join("\n");
  const env = { ...process.env, HOME: home };
  delete env.PI_CODING_AGENT_DIR;
  execFileSync(process.execPath, ["--input-type=module", "-e", script], { env, stdio: "pipe" });
}

function eventBus() {
  const handlers = new Map();
  return {
    on(name, handler) {
      const list = handlers.get(name) ?? [];
      list.push(handler);
      handlers.set(name, list);
      return () => handlers.set(name, list.filter((item) => item !== handler));
    },
    emit(name, value) {
      for (const handler of handlers.get(name) ?? []) handler(value);
    },
  };
}

function mockPi() {
  const handlers = new Map();
  const commands = new Map();
  const tools = new Map();
  let active = ["read", "write", "ask_user_question"];
  return {
    commands,
    tools,
    events: eventBus(),
    messages: [],
    on(name, handler) {
      const list = handlers.get(name) ?? [];
      list.push(handler);
      handlers.set(name, list);
    },
    async emit(name, event = {}, context = {}) {
      const results = [];
      for (const handler of handlers.get(name) ?? []) results.push(await handler(event, context));
      return results;
    },
    registerCommand(name, definition) { commands.set(name, definition); },
    registerTool(definition) {
      tools.set(definition.name, definition);
      if (!active.includes(definition.name)) active.push(definition.name);
    },
    getActiveTools() { return [...active]; },
    getAllTools() { return [...new Set([...active, ...tools.keys()])].map((name) => ({ name })); },
    setActiveTools(names) { active = [...names]; },
    sendMessage(message) { this.messages.push(message); },
    sendUserMessage(message) { this.messages.push(message); },
  };
}

function fixture() {
  const agentRoot = mkdtempSync(join(tmpdir(), "evcrate-extension-"));
  const root = join(agentRoot, "evcrate");
  mkdirSync(join(root, "commands"), { recursive: true });
  mkdirSync(join(root, "workflows"), { recursive: true });
  writeFileSync(join(root, "commands", "evc-cmd-limited.md"), "---\nallowed-tools: Read, AskUserQuestion, evcrate_command\n---\nlimited");
  writeFileSync(join(root, "commands", "evc-cmd-child.md"), "child");
  writeFileSync(join(root, "commands", "evc-cmd-fail.md"), "---\nallowed-tools: Read\n---\n!`true`");
  writeFileSync(join(root, "workflows", "flow.md"), "flow");
  const extensionDir = join(agentRoot, "extensions", "evcrate");
  cpSync(overlayExtensionDir, extensionDir, { recursive: true });
  symlinkSync(join(projectRoot, "node_modules"), join(agentRoot, "node_modules"), "dir");
  return { agentRoot, root, extensionPath: join(extensionDir, "index.js") };
}

test("extension registers policy before tools, preserves markers, and restores restricted tools", async () => {
  const { agentRoot, root, extensionPath } = fixture();
  const runInstalledExtension = (await import(pathToFileURL(extensionPath).href)).default;
  const conflictingAgentDir = join(agentRoot, "conflicting-agent-dir");
  const oldRoot = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = conflictingAgentDir;
  try {
    const pi = mockPi();
    const result = await runInstalledExtension(pi);
    assert.equal(result.agentRoot, agentRoot);
    assert.equal(result.resourceRoot, root);
    assert.deepEqual([...pi.tools.keys()].sort(), ["evcrate_command", "evcrate_subagent"]);
    await pi.emit("session_start");
    const original = pi.getActiveTools();
    await assert.rejects(pi.commands.get("evc-cmd-fail").handler("", { cwd: join(agentRoot, "missing") }));
    assert.deepEqual(pi.getActiveTools().sort(), original.sort());
    await pi.commands.get("evc-cmd-limited").handler("", { cwd: agentRoot });
    assert.deepEqual(pi.getActiveTools().sort(), ["ask_user_question", "evcrate_command", "read"]);
    assert.equal((await pi.emit("tool_call", { toolName: "write", toolCallId: "write-1" }))[0]?.block, true);
    pi.setActiveTools(["write"]);
    assert.equal((await pi.emit("tool_call", { toolName: "write", toolCallId: "write-2" }))[0]?.block, true);
    await pi.emit("agent_settled");
    assert.deepEqual(pi.getActiveTools().sort(), original.sort());
    await pi.commands.get("evc-cmd-limited").handler("", { cwd: agentRoot });
    await pi.emit("session_shutdown", { reason: "reload" });
    assert.deepEqual(pi.getActiveTools().sort(), original.sort());

    const siblingContext = {
      sessionManager: {
        buildContextEntries: () => [{ message: {
          role: "assistant",
          content: [
            { type: "toolCall", id: "command", name: "evcrate_command" },
            { type: "toolCall", id: "read", name: "read" },
          ],
        } }],
      },
    };
    assert.equal((await pi.emit("tool_call", { toolName: "evcrate_command", toolCallId: "command" }, siblingContext))[0]?.block, true);
    assert.equal((await pi.emit("tool_call", { toolName: "read", toolCallId: "read" }, siblingContext))[0]?.block, true);

    const resolvedMarkers = resolveEvcrateMarkers(
      "before {{evcrate:commands/evc-cmd-child}} after {{evcrate:workflows/flow.md}}",
      agentRoot,
    );
    assert.match(resolvedMarkers, /name `evc-cmd-child`/);
    assert.ok(resolvedMarkers.endsWith(join(root, "workflows", "flow.md")));
  } finally {
    if (oldRoot === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = oldRoot;
    rmSync(agentRoot, { recursive: true, force: true });
  }
});

test("resolvers preserve installed-root contract, fallback precedence, and errors", () => {
  const root = mkdtempSync(join(tmpdir(), "evcrate-root-resolution-"));
  try {
    const explicit = join(root, "missing", "agent", "evcrate");
    const conflictingHome = join(root, "conflicting-home");
    const injectedHome = join(root, "injected-home");
    const windowsProfile = join(root, "windows-profile");

    const installedAgentRoot = join(root, "installed-agent");
    const extensionUrl = pathToFileURL(join(installedAgentRoot, "extensions", "evcrate", "index.js")).href;
    assert.equal(getInstalledAgentRoot(extensionUrl), installedAgentRoot);

    assert.equal(
      getAgentRoot({ PI_CODING_AGENT_DIR: explicit, HOME: conflictingHome }, windowsProfile),
      resolve(root, "missing", "agent"),
    );
    assert.equal(
      getAgentRoot({ PI_CODING_AGENT_DIR: "", HOME: injectedHome }),
      resolve(injectedHome, ".pi", "agent"),
    );
    const platformRoot = getAgentRoot({}, windowsProfile);
    assert.ok(isAbsolute(platformRoot));
    assert.equal(
      platformRoot,
      resolve(windowsProfile, ".pi", "agent"),
    );
    assert.throws(() => getAgentRoot({}, ""), { message: REQUIRED_ROOT_ERROR });
    assertProcessHomeFallback(overlayPathsPath, join(root, "process-home"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("extension normalizes an EVCrate resource root before skill discovery", async () => {
  const container = mkdtempSync(join(tmpdir(), "evcrate-resource-root-"));
  const agentRoot = join(container, "agent");
  const resourceRoot = join(agentRoot, "evcrate");
  const extensionDir = join(agentRoot, "extensions", "evcrate");
  const oldRoot = process.env.PI_CODING_AGENT_DIR;
  try {
    mkdirSync(join(resourceRoot, "commands"), { recursive: true });
    writeFileSync(join(resourceRoot, "commands", "evc-cmd-child.md"), "child");
    cpSync(overlayExtensionDir, extensionDir, { recursive: true });
    symlinkSync(join(projectRoot, "node_modules"), join(agentRoot, "node_modules"), "dir");
    const { default: runInstalledExtension } = await import(pathToFileURL(join(extensionDir, "index.js")).href);

    process.env.PI_CODING_AGENT_DIR = resourceRoot;
    const pi = mockPi();
    const result = await runInstalledExtension(pi);
    assert.equal(result.agentRoot, agentRoot);
    assert.equal(result.resourceRoot, resourceRoot);
    assert.equal(process.env.PI_CODING_AGENT_DIR, agentRoot);
    await pi.emit("session_start");
    assert.ok(pi.commands.has("evc-cmd-child"));
  } finally {
    if (oldRoot === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = oldRoot;
    rmSync(container, { recursive: true, force: true });
  }
});

test("isolated published Pi entrypoint preserves resolver and hook adapter behavior", { timeout: 180_000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), "evcrate-published-pi-"));
  const home = join(root, "home");
  const state = join(root, "state");
  mkdirSync(home, { recursive: true });
  mkdirSync(state, { recursive: true });
  try {
    const context = resolveInvocationContext({
      packageRoot: projectRoot,
      cwd: root,
      projectRoot: root,
      home,
      stateHome: state,
      targets: ["pi"],
    });
    publishDryRun(context);
    assert.equal(existsSync(join(home, ".pi/agent/extensions/evcrate/index.js")), false,
      "dry-run must not install an extension");
    publishApply(context);

    const publishedAgentRoot = join(home, ".pi", "agent");
    symlinkSync(join(projectRoot, "node_modules"), join(publishedAgentRoot, "node_modules"), "dir");
    const publishedExtensionPath = join(publishedAgentRoot, "extensions/evcrate/index.js");
    const publishedPathsPath = join(publishedAgentRoot, "extensions/evcrate/paths.js");
    const publishedAdapterPath = join(publishedAgentRoot, "extensions/evcrate/hook-adapter.cjs");
    const publishedPaths = await import(`${pathToFileURL(publishedPathsPath).href}?published`);
    const publishedAdapter = (await import(pathToFileURL(publishedAdapterPath).href)).default;
    const explicitResource = join(root, "explicit", "agent", "evcrate");
    assert.equal(publishedPaths.getAgentRoot({ PI_CODING_AGENT_DIR: explicitResource }), resolve(root, "explicit", "agent"));
    const adapter = publishedAdapter.createHookAdapter({
      home: join(root, "adapter-home"),
      hookMap: { schema: "evcrate-pi-hook-map-v1", events: {} },
    });
    assert.ok(isAbsolute(adapter.agentRoot));
    assert.equal(adapter.agentRoot, resolve(root, "adapter-home", ".pi", "agent"));

    const publishedExtension = (await import(pathToFileURL(publishedExtensionPath).href)).default;
    const conflictingRoot = join(root, "conflicting-agent-dir");
    const oldRoot = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = conflictingRoot;
    try {
      const pi = mockPi();
      const result = await publishedExtension(pi);
      assert.equal(result.agentRoot, publishedAgentRoot);
      assert.equal(result.resourceRoot, join(publishedAgentRoot, "evcrate"));
      await pi.emit("session_start");
      assert.ok(pi.commands.has("evc-cmd-plan"));
    } finally {
      if (oldRoot === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = oldRoot;
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Pi 0.84.1 loads a TypeBox extension from its bundled dependency", { timeout: 120_000 }, () => {
  const root = mkdtempSync(join(tmpdir(), "evcrate-pi-typebox-"));
  const piRoot = join(root, "pi");
  const extension = join(root, "typebox-loader-smoke.mjs");
  const marker = join(root, "typebox-loaded.json");
  try {
    execFileSync("npm", [
      "install", "--prefix", piRoot, "--ignore-scripts", "--no-audit", "--no-fund",
      "@earendil-works/pi-coding-agent@0.84.1",
    ], { stdio: "pipe" });
    writeFileSync(extension, [
      'import { writeFileSync } from "node:fs";',
      'import { Type } from "typebox";',
      'writeFileSync(process.env.TYPEBOX_SMOKE_MARKER, JSON.stringify(Type.Object({ ok: Type.Boolean() })));',
      'export default function (pi) { pi.registerCommand("typebox-smoke", { handler: () => {} }); }',
      "",
    ].join("\n"));

    execFileSync(join(piRoot, "node_modules/.bin/pi"), [
      "--no-session", "--no-context-files", "--no-extensions", "--no-tools", "-e", extension, "--help",
    ], {
      cwd: root,
      env: {
        ...process.env,
        PI_OFFLINE: "1",
        PI_SKIP_VERSION_CHECK: "1",
        PI_TELEMETRY: "0",
        TYPEBOX_SMOKE_MARKER: marker,
      },
      stdio: "pipe",
    });

    const installed = JSON.parse(readFileSync(join(piRoot, "node_modules/@earendil-works/pi-coding-agent/package.json"), "utf8"));
    assert.equal(installed.version, "0.84.1");
    assert.deepEqual(JSON.parse(readFileSync(marker, "utf8")), {
      type: "object", required: ["ok"], properties: { ok: { type: "boolean" } },
    });

    const alternatePiRoot = join(root, "alternate-pi");
    const alternateAgentRoot = join(alternatePiRoot, "agent");
    const alternateExtensionDir = join(alternateAgentRoot, "extensions", "evcrate");
    cpSync(overlayExtensionDir, alternateExtensionDir, { recursive: true });
    mkdirSync(join(alternateAgentRoot, "evcrate", "commands"), { recursive: true });
    writeFileSync(join(alternateAgentRoot, "evcrate", "commands", "evc-cmd-smoke.md"), "smoke");
    execFileSync(join(piRoot, "node_modules/.bin/pi"), [
      "--no-session", "--no-context-files", "--no-tools", "--no-extensions",
      "-e", join(alternateAgentRoot, "extensions/evcrate/index.js"), "--help",
    ], {
      cwd: root,
      env: {
        ...process.env,
        PI_CODING_AGENT_DIR: alternateAgentRoot,
        PI_OFFLINE: "1",
        PI_SKIP_VERSION_CHECK: "1",
        PI_TELEMETRY: "0",
      },
      stdio: "pipe",
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("child-start runner derives allowlisted generated scripts without subscribing to lifecycle events", async () => {
  const { agentRoot, root } = fixture();
  try {
    mkdirSync(join(root, "hooks"));
    writeFileSync(join(root, "hook-map.json"), JSON.stringify({
      schema: "evcrate-pi-hook-map-v1",
      events: { SubagentStart: [{ matcher: "*", scripts: ["child.cjs", "../escape.cjs"] }] },
    }));
    writeFileSync(join(root, "hooks", "child.cjs"), "if(process.env.PI_CODING_AGENT_DIR&&process.env.EVCRATE_RESOURCE_ROOT)console.log(JSON.stringify({hookSpecificOutput:{additionalContext:'hook context'}}))");
    const runner = createChildStartRunner({ agentRoot, resourceRoot: root });
    const result = await runChildStart({
      runner,
      canonicalEvent: { request: { agent: "tester", nodeId: "node-1", cwd: agentRoot } },
      task: "review",
      runtimeRoots: { resourceRoot: root },
    });
    assert.equal(result.additionalContext, "hook context");
    assert.match(result.task, /^review\n\nhook context\n\nActive resource root:/);
  } finally {
    rmSync(agentRoot, { recursive: true, force: true });
  }
});
