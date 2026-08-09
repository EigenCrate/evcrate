import assert from "node:assert/strict";
import test from "node:test";

import { createOperationPolicy, registerOperationPolicyGate } from "../files/agent/extensions/evcrate/operation-policy.js";

function mockPi() {
  const handlers = new Map();
  let active = ["read", "write", "bash"];
  return {
    on(name, handler) {
      const listeners = handlers.get(name) ?? [];
      listeners.push(handler);
      handlers.set(name, listeners);
    },
    emit(name, event = {}, context = {}) {
      return (handlers.get(name) ?? []).map((handler) => handler(event, context));
    },
    getActiveTools() { return [...active]; },
    getAllTools() { return ["read", "write", "bash"].map((name) => ({ name })); },
    setActiveTools(names) { active = [...names]; },
  };
}

test("operation policy rejects an independent restricted overlap", () => {
  const policy = createOperationPolicy(mockPi());
  policy.begin({ allowedTools: ["Read"] });

  assert.throws(
    () => policy.begin({ allowedTools: ["Write"] }),
    /Concurrent restricted EVCrate operations are not supported/,
  );
});

test("operation policy intersects nested scopes and restores each scope on release", () => {
  const pi = mockPi();
  const policy = createOperationPolicy(pi);
  const outer = policy.begin({ allowedTools: ["Read", "Write"] });
  const inner = policy.begin({ allowedTools: ["Write", "Bash"], parentToken: outer });

  assert.deepEqual(pi.getActiveTools(), ["write"]);
  policy.release(inner);
  assert.deepEqual(pi.getActiveTools(), ["read", "write"]);
  policy.release(outer);
  assert.deepEqual(pi.getActiveTools(), ["read", "write", "bash"]);
  assert.equal(policy.active(), false);
});

test("terminal cleanup releases restricted tools and clears a blocked dispatcher batch", () => {
  const pi = mockPi();
  const policy = registerOperationPolicyGate(pi);
  policy.begin({ allowedTools: ["Read"] });
  const mixedBatch = {
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

  assert.equal(pi.emit("tool_call", { toolName: "evcrate_command", toolCallId: "command" }, mixedBatch)[0]?.block, true);
  assert.equal(pi.emit("tool_call", { toolName: "read", toolCallId: "read" }, mixedBatch)[0]?.block, true);

  pi.emit("agent_settled");
  assert.deepEqual(pi.getActiveTools(), ["read", "write", "bash"]);
  assert.equal(policy.active(), false);
  assert.equal(pi.emit("tool_call", { toolName: "read", toolCallId: "read" })[0], undefined);
});
