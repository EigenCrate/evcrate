import assert from "node:assert/strict";
import test from "node:test";

import { registerHooks } from "../files/agent/extensions/evcrate/hooks.js";

function mockPi() {
  const handlers = new Map();
  return {
    messages: [],
    on(name, handler) { handlers.set(name, [...(handlers.get(name) ?? []), handler]); },
    sendMessage(message, options) { this.messages.push({ message, options }); },
    async emit(name, event = {}, context = {}) {
      const results = [];
      for (const handler of handlers.get(name) ?? []) results.push(await handler(event, context));
      return results;
    },
    count(name) { return (handlers.get(name) ?? []).length; },
  };
}

test("one hook owner maps lifecycle reasons and blocks canonical safety hooks", async () => {
  const pi = mockPi();
  const calls = [];
  const adapter = {
    clearSessionEnv() { calls.push({ type: "clear" }); },
    async run(type, event) {
      calls.push({ type, event });
      if (type === "PreToolUse") return { blockReason: "privacy block" };
      if (type === "SessionStart") return { additionalContext: "session context" };
      if (type === "UserPromptSubmit") return { additionalContext: "prompt context" };
      if (type === "PostToolUse") return { additionalContext: "post-write context" };
      return {};
    },
  };
  registerHooks(pi, { adapter });
  for (const event of ["session_start", "session_before_compact", "session_compact", "before_agent_start", "tool_call", "tool_result", "session_shutdown"]) {
    assert.equal(pi.count(event), 1, `${event} has one EVCrate owner`);
  }
  await pi.emit("session_start", { reason: "startup" }, { cwd: "/repo" });
  assert.deepEqual(pi.messages[0], {
    message: { customType: "evcrate-hook-context", content: "session context", display: false },
    options: { deliverAs: "nextTurn" },
  });
  await pi.emit("session_before_compact", { reason: "overflow" }, { cwd: "/repo" });
  assert.equal(calls[1].type, "PreCompact");
  assert.equal(calls[1].event.reason, "overflow");
  const prompt = (await pi.emit("before_agent_start", {}, { cwd: "/repo" }))[0];
  assert.deepEqual(prompt.message, { customType: "evcrate-hook-context", content: "prompt context", display: false });
  const blocked = (await pi.emit("tool_call", { toolName: "ls", input: { path: ".env" } }))[0];
  assert.deepEqual(blocked, { block: true, reason: "privacy block" });
  const post = (await pi.emit("tool_result", { toolName: "write", input: { path: "x" }, content: [{ type: "text", text: "ok" }] }))[0];
  assert.deepEqual(post.content, [{ type: "text", text: "ok" }, { type: "text", text: "post-write context" }]);
  await pi.emit("session_shutdown", { reason: "quit" }, { ui: { setStatus() {} } });
  assert.deepEqual(calls.at(-2), { type: "SessionEnd", event: { reason: "quit", sessionId: undefined } });
  assert.deepEqual(calls.at(-1), { type: "clear" });
});
