import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import runExtension from "../files/agent/extensions/evcrate/index.js";
import { createChildStartRunner, runChildStart } from "../files/agent/extensions/evcrate/child-context.js";
import { resolveEvcrateMarkers } from "../files/agent/extensions/evcrate/paths.js";

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
