import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import adapterModule from "../files/agent/extensions/evcrate/hook-adapter.cjs";

const { createHookAdapter, mapReason, mapToolName, parseEnvFile } = adapterModule;
const require = createRequire(import.meta.url);
const generatedAdapterPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../source/.pi/agent/extensions/evcrate/hook-adapter.cjs",
);
const adapterModules = [
  { name: "overlay", path: resolve(dirname(fileURLToPath(import.meta.url)), "../files/agent/extensions/evcrate/hook-adapter.cjs"), module: adapterModule },
  { name: "generated", path: generatedAdapterPath, module: require(generatedAdapterPath) },
];
const HOOK_MAP = JSON.stringify({ schema: "evcrate-pi-hook-map-v1", events: {} });
const REQUIRED_ROOT_ERROR = "PI_CODING_AGENT_DIR or HOME is required to locate the Pi agent root";

function assertAdapterRootMatrix(modulePath, root) {
  const script = [
    `const { createHookAdapter } = require(${JSON.stringify(modulePath)});`,
    'const { isAbsolute, resolve } = require("node:path");',
    `const hookMap = ${HOOK_MAP};`,
    'const explicitResource = process.env.EXPLICIT_ROOT;',
    'const fallbackHome = process.env.FALLBACK_HOME;',
    'const expectedExplicit = resolve(explicitResource, "..");',
    'const optionAdapter = createHookAdapter({ agentRoot: explicitResource, home: fallbackHome, hookMap });',
    'if (!isAbsolute(optionAdapter.agentRoot) || resolve(optionAdapter.agentRoot) !== expectedExplicit) process.exit(1);',
    'process.env.PI_CODING_AGENT_DIR = explicitResource;',
    'const envAdapter = createHookAdapter({ home: fallbackHome, hookMap });',
    'if (!isAbsolute(envAdapter.agentRoot) || resolve(envAdapter.agentRoot) !== expectedExplicit) process.exit(2);',
    'delete process.env.PI_CODING_AGENT_DIR;',
    'const relativeAdapter = createHookAdapter({ home: "relative-home", hookMap });',
    'if (!isAbsolute(relativeAdapter.agentRoot) || resolve(relativeAdapter.agentRoot) !== resolve("relative-home", ".pi", "agent")) process.exit(3);',
    'try { createHookAdapter({ home: "", hookMap }); }',
    `catch (error) { if (error.message === ${JSON.stringify(REQUIRED_ROOT_ERROR)}) process.exit(0); }`,
    'process.exit(4);',
  ].join("\n");
  const env = {
    ...process.env,
    EXPLICIT_ROOT: resolve(root, "explicit-agent", "agent", "evcrate"),
    FALLBACK_HOME: resolve(root, "fallback-home"),
  };
  delete env.PI_CODING_AGENT_DIR;
  execFileSync(process.execPath, ["-e", script], { env, stdio: "pipe" });
}

function fixture() {
  const agentRoot = mkdtempSync(join(tmpdir(), "evcrate-hook-adapter-"));
  const resourceRoot = join(agentRoot, "evcrate");
  mkdirSync(join(resourceRoot, "hooks"), { recursive: true });
  for (const script of ["privacy-block.cjs", "scout-block.cjs", "session-init.cjs", "reminder.cjs"]) {
    writeFileSync(join(resourceRoot, "hooks", script), "// fixture");
  }
  return { agentRoot, resourceRoot };
}

test("maps Pi reasons and built-in file tools to canonical hook values", () => {
  assert.equal(mapReason("threshold"), "auto");
  assert.equal(mapReason("overflow"), "auto");
  assert.equal(mapReason("resume"), "resume");
  assert.equal(mapToolName("find"), "Glob");
  assert.equal(mapToolName("ls"), "Glob");
  assert.equal(mapToolName("write"), "Write");
});

test("overlay and generated adapters preserve root precedence, fallback, and errors", () => {
  const root = mkdtempSync(join(tmpdir(), "evcrate-hook-root-resolution-"));
  try {
    for (const { name, path } of adapterModules) {
      assert.doesNotThrow(() => assertAdapterRootMatrix(path, root), `${name} root matrix failed`);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("safety hook failures block while optional contexts remain parsed", async () => {
  const { agentRoot, resourceRoot } = fixture();
  try {
    const hookMap = { schema: "evcrate-pi-hook-map-v1", events: {
      PreToolUse: [{ matcher: "Glob", scripts: ["privacy-block.cjs"], safetyScripts: ["privacy-block.cjs"] }],
      UserPromptSubmit: [{ matcher: "*", scripts: ["reminder.cjs"], safetyScripts: [] }],
    } };
    const calls = [];
    const adapter = createHookAdapter({ agentRoot, resourceRoot, hookMap, execute: async (script, payload) => {
      calls.push({ script, payload });
      if (script.endsWith("privacy-block.cjs")) return { code: 2, stdout: "", stderr: "blocked" };
      return { code: 0, stdout: "prompt context", stderr: "" };
    } });
    const blocked = await adapter.run("PreToolUse", { toolName: "ls", input: { path: ".env" } }, { cwd: agentRoot, sessionId: "s1" });
    assert.match(blocked.blockReason, /code 2/);
    assert.equal(calls[0].payload.tool_name, "Glob");
    assert.equal(calls[0].payload.tool_input.file_path, ".env");
    const prompt = await adapter.run("UserPromptSubmit", {}, { cwd: agentRoot, sessionId: "s1" });
    assert.equal(prompt.additionalContext, "prompt context");
  } finally { rmSync(agentRoot, { recursive: true, force: true }); }
});

test("invalid generated hook maps fail closed before safety tool calls", async () => {
  const { agentRoot, resourceRoot } = fixture();
  try {
    const adapter = createHookAdapter({ agentRoot, resourceRoot, hookMap: { schema: "wrong", events: {} } });
    const result = await adapter.run("PreToolUse", { toolName: "read", input: { path: ".env" } }, { cwd: agentRoot });
    assert.match(result.blockReason, /hook map/i);
  } finally { rmSync(agentRoot, { recursive: true, force: true }); }
});

test("session hooks accept only bounded EVCRATE environment assignments and clean up state", async () => {
  const { agentRoot, resourceRoot } = fixture();
  try {
    const hookMap = { schema: "evcrate-pi-hook-map-v1", events: {
      SessionStart: [{ matcher: "startup", scripts: ["session-init.cjs"], safetyScripts: [] }],
    } };
    const adapter = createHookAdapter({ agentRoot, resourceRoot, hookMap, execute: async (_script, _payload, options) => {
      writeFileSync(options.env.CLAUDE_ENV_FILE, "EVCRATE_TEST=value\nEVCRATE_OTHER=two\n");
      return { code: 0, stdout: "session context", stderr: "" };
    } });
    const result = await adapter.run("SessionStart", { reason: "startup" }, { cwd: agentRoot, sessionId: "session" });
    assert.equal(result.additionalContext, "session context");
    assert.deepEqual(adapter.sessionEnv, { EVCRATE_TEST: "value", EVCRATE_OTHER: "two" });
    assert.equal(adapter.environment().EVCRATE_TEST, "value");
    adapter.clearSessionEnv();
    assert.deepEqual(adapter.sessionEnv, {});
    assert.throws(() => parseEnvFile(writeInvalidEnv(agentRoot)), /invalid assignment/);
  } finally { rmSync(agentRoot, { recursive: true, force: true }); }
});

function writeInvalidEnv(root) {
  const path = join(root, "invalid.env");
  writeFileSync(path, "NOT_CK=value\n");
  return path;
}
