import assert from "node:assert/strict";
import test from "node:test";
import { createDelegationRunner, DELEGATION_EVENTS, registerDelegationTool } from "../files/agent/extensions/evcrate/delegation-tool.js";
import { resolveModelRole } from "../files/agent/extensions/evcrate/model-roles.js";

function eventBus() {
  const handlers = new Map();
  return {
    on(name, handler) {
      const list = handlers.get(name) ?? [];
      list.push(handler); handlers.set(name, list);
      return () => handlers.set(name, (handlers.get(name) ?? []).filter((item) => item !== handler));
    },
    emit(name, value) { for (const handler of [...(handlers.get(name) ?? [])]) handler(value); },
  };
}

function complete(bus, request, text = request.task) {
  bus.emit(DELEGATION_EVENTS.started, request);
  bus.emit(DELEGATION_EVENTS.update, { ...request, currentTool: "read" });
  bus.emit(DELEGATION_EVENTS.response, { ...request, status: "completed", result: { kind: "text", text } });
}

test("direct delegation emits correlated structured protocol and child context", async () => {
  const events = eventBus();
  const seen = [];
  events.on(DELEGATION_EVENTS.request, (request) => { seen.push(request); complete(events, request, "done"); });
  const delegate = createDelegationRunner({
    events, createId: (() => { let index = 0; return () => String(++index); })(),
    childStartRunner: async (event) => ({ hookSpecificOutput: { additionalContext: `hook for ${event.request.agent}` } }),
    runtimeRoots: { workflowRoot: "/workflows", configRoot: "/config", resourceRoot: "/resources" },
  });
  const updates = [];
  const result = await delegate({ direct: { agent: "planner", task: "plan" } }, { cwd: "/repo", onUpdate: (value) => updates.push(value) });
  assert.equal(result.results[0].response.result.text, "done");
  assert.match(seen[0].task, /hook for planner/);
  assert.match(seen[0].task, /Active resource root: \/resources/);
  assert.match(seen[0].requestId, /^evcrate-request-/);
  assert.match(seen[0].ownerRunId, /^evcrate-owner-/);
  assert.match(seen[0].nodeId, /^evcrate-node-0-/);
  assert.equal(updates[0].currentTool, "read");
});

test("parallel and sequential requests aggregate terminal responses", async () => {
  const events = eventBus();
  const order = [];
  events.on(DELEGATION_EVENTS.request, (request) => { order.push(request.agent); complete(events, request, request.agent); });
  const delegate = createDelegationRunner({ events });
  const parallel = await delegate({ mode: "parallel", nodes: [{ agent: "a", task: "a" }, { agent: "b", task: "b" }] }, { cwd: "/repo" });
  assert.deepEqual(parallel.results.map((item) => item.response.result.text).sort(), ["a", "b"]);
  const sequential = await delegate({ mode: "sequential", nodes: [{ agent: "c", task: "c" }, { agent: "d", task: "d" }] }, { cwd: "/repo" });
  assert.deepEqual(sequential.results.map((item) => item.response.result.text), ["c", "d"]);
  assert.deepEqual(order, ["a", "b", "c", "d"]);
});

test("missing, duplicate, partial, and cancelled terminal paths reject", async () => {
  for (const scenario of ["before-started", "duplicate", "partial", "cancel"]) {
    const events = eventBus();
    const controller = new AbortController();
    events.on(DELEGATION_EVENTS.request, (request) => {
      if (scenario === "before-started") events.emit(DELEGATION_EVENTS.response, { ...request, status: "completed", result: { kind: "text", text: "x" } });
      if (scenario === "duplicate") { complete(events, request); events.emit(DELEGATION_EVENTS.response, { ...request, status: "completed", result: { kind: "text", text: "again" } }); }
      if (scenario === "partial") { events.emit(DELEGATION_EVENTS.started, request); events.emit(DELEGATION_EVENTS.response, { ...request, status: "completed" }); }
      if (scenario === "cancel") { events.emit(DELEGATION_EVENTS.started, request); controller.abort(); }
    });
    const delegate = createDelegationRunner({ events, timeoutMs: 100 });
    await assert.rejects(delegate({ agent: "a", task: "x" }, { cwd: "/repo", signal: controller.signal }), /delegation/);
  }
});

test("explicit invalid model is rejected while role routing preserves valid overrides", async () => {
  const events = eventBus();
  events.on(DELEGATION_EVENTS.request, (request) => complete(events, request));
  const registry = [{ provider: "openai-codex", id: "gpt-5.6-sol" }];
  const roles = { planner: { role: "strong" } };
  const delegate = createDelegationRunner({
    events,
    resolveModel: (node) => resolveModelRole({ ...node, agentRoles: roles, registry: node.registry }),
  });
  await assert.rejects(delegate({ agent: "planner", task: "x", model: "malformed" }, { cwd: "/repo", modelRegistry: registry }), /provider\/model/);
  const routed = await delegate({ agent: "planner", task: "x", provider: "openai-codex" }, { cwd: "/repo", modelRegistry: registry });
  assert.equal(routed.results[0].request.model, "openai-codex/gpt-5.6-sol");
});

test("Pi registration exposes evcrate_subagent without workflowScript", async () => {
  const events = eventBus();
  events.on(DELEGATION_EVENTS.request, (request) => complete(events, request));
  let tool;
  const pi = { events, on: () => {}, registerTool: (value) => { tool = value; } };
  registerDelegationTool(pi, {});
  assert.equal(tool.name, "evcrate_subagent");
  assert.equal("workflowScript" in tool.parameters.properties, false);
  const result = await tool.execute("call", { agent: "a", task: "x" }, undefined, undefined, { cwd: "/repo", modelRegistry: [] });
  assert.equal(result.details.results[0].response.status, "completed");
});
