import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

test("retained startup context is superseded without losing reminders or other instructions", async (t) => {
  const agentRoot = mkdtempSync(join(tmpdir(), "evcrate-hooks-retained-"));
  t.after(() => rmSync(agentRoot, { recursive: true, force: true }));
  mkdirSync(join(agentRoot, "evcrate"), { recursive: true });
  const payload = "INSTALLED_INSTRUCTIONS";
  writeFileSync(join(agentRoot, "evcrate", "AGENTS.md"), `${payload}\n`);
  const pi = mockPi();
  let turn = 0;
  registerHooks(pi, { adapter: {
    agentRoot,
    async run(event) {
      return event === "UserPromptSubmit" ? { additionalContext: `REMINDER_${++turn}` } : {};
    },
  } });
  const startupMessage = async () => ({
    role: "custom", ...(await pi.emit("before_agent_start"))[0].message,
  });
  await pi.emit("session_start");
  const oldStartup = await startupMessage();
  const ordinaryReminder = await startupMessage();
  await pi.emit("session_compact");
  const replacement = await startupMessage();
  const user = { role: "user", content: "USER_INSTRUCTIONS" };
  const otherExtension = { role: "custom", customType: "other-extension", content: "OTHER_INSTRUCTIONS", details: { evcrateStartup: true } };
  const retained = [user, oldStartup, ordinaryReminder, otherExtension, replacement];
  const original = structuredClone(retained);
  const outgoing = (await pi.emit("context", { messages: retained }))[0].messages;
  const text = outgoing.map((message) => message.content).join("\n");
  assert.equal(text.split(payload).length - 1, 1);
  for (const marker of ["REMINDER_1", "REMINDER_2", "REMINDER_3", "USER_INSTRUCTIONS", "OTHER_INSTRUCTIONS"]) {
    assert.equal(text.split(marker).length - 1, 1);
  }
  assert.deepEqual(retained, original);
  assert.equal(outgoing.find((message) => message === otherExtension), otherExtension);
  assert.deepEqual(await pi.emit("context", { messages: outgoing }), [undefined]);
  const nextReminder = await startupMessage();
  const nextContext = [...outgoing, nextReminder];
  assert.deepEqual(await pi.emit("context", { messages: nextContext }), [undefined]);
  assert.equal(nextContext.map((message) => message.content).join("\n").split(payload).length - 1, 1);
});

test("unsafe required payload consumes input after a host-swallowed lifecycle error", async (t) => {
  const agentRoot = mkdtempSync(join(tmpdir(), "evcrate-hooks-admission-"));
  t.after(() => rmSync(agentRoot, { recursive: true, force: true }));
  mkdirSync(join(agentRoot, "evcrate"), { recursive: true });
  const pi = mockPi();
  const diagnostics = [];
  t.mock.method(console, "error", (message) => diagnostics.push(message));
  registerHooks(pi, { adapter: { agentRoot, async run() { return {}; } } });
  await assert.rejects(pi.emit("session_start"));
  assert.deepEqual(await pi.emit("input"), [{ action: "handled" }]);
  assert.equal(diagnostics.some((message) => message.includes("AGENTS")), true);
  writeFileSync(join(agentRoot, "evcrate", "AGENTS.md"), "restored instructions\n");
  assert.deepEqual(await pi.emit("input"), [undefined]);
  const admitted = (await pi.emit("before_agent_start"))[0];
  assert.equal(admitted.message.content, "restored instructions");
  rmSync(join(agentRoot, "evcrate", "AGENTS.md"));
  await assert.rejects(pi.emit("session_compact"));
  assert.deepEqual(await pi.emit("input"), [{ action: "handled" }]);
  writeFileSync(join(agentRoot, "evcrate", "AGENTS.md"), "new context instructions\n");
  assert.deepEqual(await pi.emit("input"), [undefined]);
  assert.equal((await pi.emit("before_agent_start"))[0].message.content, "new context instructions");
});
