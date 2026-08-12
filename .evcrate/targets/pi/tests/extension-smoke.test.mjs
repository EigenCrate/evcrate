import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import runExtension from "../files/agent/extensions/evcrate/index.js";
import { createChildStartRunner, runChildStart } from "../files/agent/extensions/evcrate/child-context.js";
import { getAgentRoot, resolveEvcrateMarkers } from "../files/agent/extensions/evcrate/paths.js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const generatedExtensionPath = join(projectRoot, ".evcrate/source/.pi/agent/extensions/evcrate/index.js");
const generatedPathsPath = join(projectRoot, ".evcrate/source/.pi/agent/extensions/evcrate/paths.js");
const generatedExtension = (await import(pathToFileURL(generatedExtensionPath).href)).default;
const generatedPaths = await import(pathToFileURL(generatedPathsPath).href);
const runtimeResolvers = [
  { name: "overlay", path: fileURLToPath(new URL("../files/agent/extensions/evcrate/paths.js", import.meta.url)), module: { getAgentRoot } },
  { name: "generated", path: generatedPathsPath, module: generatedPaths },
];
const runtimeExtensions = [
  { name: "overlay", extension: runExtension },
  { name: "generated", extension: generatedExtension },
];
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
  writeFileSync(join(root, "commands", "limited.md"), "---\nallowed-tools: Read, AskUserQuestion, evcrate_command\n---\nlimited");
  writeFileSync(join(root, "commands", "child.md"), "child");
  writeFileSync(join(root, "commands", "fail.md"), "---\nallowed-tools: Read\n---\n!`true`");
  writeFileSync(join(root, "workflows", "flow.md"), "flow");
  return { agentRoot, root };
}

test("extension registers policy before tools, preserves markers, and restores restricted tools", async () => {
  const { agentRoot, root } = fixture();
  const oldRoot = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentRoot;
  try {
    const pi = mockPi();
    await runExtension(pi);
    assert.deepEqual([...pi.tools.keys()].sort(), ["evcrate_command", "evcrate_subagent"]);
    await pi.emit("session_start");
    const original = pi.getActiveTools();
    await assert.rejects(pi.commands.get("fail").handler("", { cwd: join(agentRoot, "missing") }));
    assert.deepEqual(pi.getActiveTools().sort(), original.sort());
    await pi.commands.get("limited").handler("", { cwd: agentRoot });
    assert.deepEqual(pi.getActiveTools().sort(), ["ask_user_question", "evcrate_command", "read"]);
    assert.equal((await pi.emit("tool_call", { toolName: "write", toolCallId: "write-1" }))[0]?.block, true);
    pi.setActiveTools(["write"]);
    assert.equal((await pi.emit("tool_call", { toolName: "write", toolCallId: "write-2" }))[0]?.block, true);
    await pi.emit("agent_settled");
    assert.deepEqual(pi.getActiveTools().sort(), original.sort());
    await pi.commands.get("limited").handler("", { cwd: agentRoot });
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

    assert.equal(
      resolveEvcrateMarkers("before {{evcrate:commands/child}} after {{evcrate:workflows/flow.md}}", agentRoot),
      `before Invoke \`evcrate_command\` with \`{"name":"child","args":""}\`. after ${join(root, "workflows", "flow.md")}`,
    );
  } finally {
    if (oldRoot === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = oldRoot;
    rmSync(agentRoot, { recursive: true, force: true });
  }
});

test("overlay and generated extension entrypoints share startup registration", async () => {
  for (const { name, extension } of runtimeExtensions) {
    const { agentRoot, root } = fixture();
    const oldRoot = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = agentRoot;
    try {
      const pi = mockPi();
      const result = await extension(pi);
      assert.equal(result.agentRoot, agentRoot, `${name} selected an unexpected agent root`);
      assert.equal(result.resourceRoot, root, `${name} selected an unexpected resource root`);
      assert.deepEqual([...pi.tools.keys()].sort(), ["evcrate_command", "evcrate_subagent"]);
      await pi.emit("session_start");
      assert.ok(pi.commands.has("child"), `${name} did not register fixture commands`);
    } finally {
      if (oldRoot === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = oldRoot;
      rmSync(agentRoot, { recursive: true, force: true });
    }
  }
});

test("overlay and generated resolvers preserve precedence, fallback, and errors", () => {
  const root = mkdtempSync(join(tmpdir(), "evcrate-root-resolution-"));
  try {
    const explicit = join(root, "missing", "agent", "evcrate");
    const conflictingHome = join(root, "conflicting-home");
    const injectedHome = join(root, "injected-home");
    const windowsProfile = join(root, "windows-profile");
    for (const { name, path, module } of runtimeResolvers) {
      assert.equal(
        module.getAgentRoot({ PI_CODING_AGENT_DIR: explicit, HOME: conflictingHome }, windowsProfile),
        resolve(root, "missing", "agent"),
        `${name} did not preserve explicit-root precedence/normalization`,
      );
      assert.equal(
        module.getAgentRoot({ PI_CODING_AGENT_DIR: "", HOME: injectedHome }),
        resolve(injectedHome, ".pi", "agent"),
        `${name} did not preserve injected HOME fallback`,
      );
      const platformRoot = module.getAgentRoot({}, windowsProfile);
      assert.ok(isAbsolute(platformRoot), `${name} returned a relative platform-home root`);
      assert.equal(
        platformRoot,
        resolve(windowsProfile, ".pi", "agent"),
        `${name} did not use the controlled platform-home value`,
      );
      assert.throws(() => module.getAgentRoot({}, ""), { message: REQUIRED_ROOT_ERROR });
      assertProcessHomeFallback(path, join(root, `${name}-process-home`));
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("extension normalizes an EVCrate resource root before skill discovery", async () => {
  const container = mkdtempSync(join(tmpdir(), "evcrate-resource-root-"));
  const agentRoot = join(container, "agent");
  const resourceRoot = join(agentRoot, "evcrate");
  const oldRoot = process.env.PI_CODING_AGENT_DIR;
  try {
    mkdirSync(join(resourceRoot, "commands"), { recursive: true });
    writeFileSync(join(resourceRoot, "commands", "child.md"), "child");
    process.env.PI_CODING_AGENT_DIR = resourceRoot;
    const pi = mockPi();
    await runExtension(pi);
    assert.equal(process.env.PI_CODING_AGENT_DIR, agentRoot);
    await pi.emit("session_start");
    assert.ok(pi.commands.has("child"));
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
  try {
    const env = {
      ...process.env,
      EVCRATE_HOME: home,
      EVCRATE_STATE_HOME: state,
      HOME: join(root, "profile"),
    };
    delete env.PI_CODING_AGENT_DIR;
    for (const args of [
      ["distribute.py", "--build", "--target", "pi"],
      ["distribute.py", "--check", "--target", "pi"],
      ["distribute.py", "--publish", "--target", "pi"],
    ]) execFileSync("python3", args, { cwd: projectRoot, env, stdio: "pipe" });

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
    const oldRoot = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = publishedAgentRoot;
    try {
      const pi = mockPi();
      const result = await publishedExtension(pi);
      assert.equal(result.agentRoot, publishedAgentRoot);
      assert.equal(result.resourceRoot, join(publishedAgentRoot, "evcrate"));
      await pi.emit("session_start");
      assert.ok(pi.commands.has("plan"));
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

    const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
    const generatedPiRoot = join(projectRoot, ".evcrate/source/.pi");
    const alternatePiRoot = join(root, "alternate-pi");
    cpSync(generatedPiRoot, alternatePiRoot, { recursive: true });
    const alternateAgentRoot = join(alternatePiRoot, "agent");
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

test("npm pack excludes Python bytecode from publishable Pi resources", () => {
  const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
  const output = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
    cwd: projectRoot,
    encoding: "utf8",
    env: { ...process.env, npm_config_ignore_scripts: "true" },
  });
  const jsonOffset = output.indexOf("[\n");
  assert.notEqual(jsonOffset, -1, "npm pack did not emit JSON");
  const [pack] = JSON.parse(output.slice(jsonOffset));
  const paths = pack.files.map(({ path }) => path);

  assert.ok(paths.includes(".evcrate/targets/pi/files/agent/extensions/evcrate/index.js"));
  assert.ok(paths.includes(".evcrate/targets/pi/files/agent/extensions/evcrate/hook-adapter.cjs"));
  assert.ok(paths.includes("distribution/pi_settings.py"));
  assert.ok(paths.includes("distribute.py"));
  assert.ok(paths.every((path) => !path.endsWith(".pyc") && !path.includes("/__pycache__/")));
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
