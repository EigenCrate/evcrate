import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import adapterModule from "../files/agent/extensions/evcrate/hook-adapter.cjs";

const { createHookAdapter, mapReason, mapToolName, parseEnvFile } = adapterModule;

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
