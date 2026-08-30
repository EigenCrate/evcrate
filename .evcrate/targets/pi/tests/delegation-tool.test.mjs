import assert from "node:assert/strict";
import test from "node:test";
import { Compile } from "typebox/compile";
import { createDelegationRunner, DELEGATION_EVENTS, DELEGATION_PARAMETERS, registerDelegationTool } from "../files/agent/extensions/evcrate/delegation-tool.js";
import { resolveModelRole } from "../files/agent/extensions/evcrate/model-roles.js";
import { complete, eventBus } from "./delegation-tool-test-helpers.mjs";

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
  assert.deepEqual(updates[0].content, [{ type: "text", text: "Working: read" }]);
  assert.equal(updates[0].details.currentTool, "read");
});

test("inline output mode is accepted locally without forwarding unsupported bridge fields", async () => {
  const events = eventBus();
  const seen = [];
  events.on(DELEGATION_EVENTS.request, (request) => { seen.push(request); complete(events, request); });
  const delegate = createDelegationRunner({ events });
  await delegate({ agent: "planner", task: "plan", outputMode: "inline" }, { cwd: "/repo" });
  const validator = Compile(DELEGATION_PARAMETERS);
  assert.deepEqual(DELEGATION_PARAMETERS.properties.outputMode, { enum: ["inline"] });
  assert.equal(validator.Check({ agent: "planner", task: "plan", outputMode: "inline" }), true);
  assert.equal(validator.Check({ agent: "planner", task: "plan", outputMode: "file-only" }), false);
  for (const input of [
    { direct: { agent: "planner", task: "plan", outputMode: "file-only" } },
    { nodes: [{ agent: "planner", task: "plan", outputMode: "file-only" }] },
    { parallel: [{ agent: "planner", task: "plan", outputMode: "file-only" }] },
    { sequential: [{ agent: "planner", task: "plan", outputMode: "file-only" }] },
    { tasks: [{ agent: "planner", task: "plan", outputMode: "file-only" }] },
  ]) assert.equal(validator.Check(input), false);
  assert.equal(seen[0].outputMode, undefined);
  await assert.rejects(delegate({ agent: "planner", task: "plan", outputMode: "file-only" }, { cwd: "/repo" }), /outputMode must be inline/);
  for (const input of [
    { outputMode: "file-only", direct: { agent: "planner", task: "plan", outputMode: "inline" } },
    { mode: "parallel", nodes: [{ agent: "planner", task: "plan", outputMode: "inline" }], outputMode: "file-only" },
    { parallel: [{ agent: "planner", task: "plan", outputMode: "inline" }], outputMode: "file-only" },
    { sequential: [{ agent: "planner", task: "plan", outputMode: "inline" }], outputMode: "file-only" },
    { mode: "parallel", tasks: [{ agent: "planner", task: "plan", outputMode: "inline" }], outputMode: "file-only" },
  ]) await assert.rejects(delegate(input, { cwd: "/repo" }), /outputMode must be inline/);
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

test("correlated pre-start bridge terminal failures retain status and error", async () => {
  for (const [status, bridgeError] of [
    ["unavailable_context", "No active extension context."], ["invalid_request", "Malformed request."],
    ["cancelled", undefined], ["duplicate_node", undefined],
  ]) {
    const events = eventBus();
    events.on(DELEGATION_EVENTS.request, (request) => events.emit(DELEGATION_EVENTS.response, {
      ...request, status, ...(bridgeError ? { error: bridgeError } : {}),
    }));
    const delegate = createDelegationRunner({ events });
    await assert.rejects(delegate({ agent: "a", task: "x" }, { cwd: "/repo" }), (error) => {
      assert.equal(error.message, `delegation ${status}${bridgeError ? `: ${bridgeError}` : ""}`);
      return true;
    });
  }
});

test("pre-start completed, mismatched, and duplicate terminals reject", async () => {
  for (const scenario of ["completed", "mismatched", "duplicate"]) {
    const events = eventBus();
    events.on(DELEGATION_EVENTS.request, (request) => {
      if (scenario === "completed") events.emit(DELEGATION_EVENTS.response, { ...request, status: "completed", result: { kind: "text", text: "x" } });
      if (scenario === "mismatched") events.emit(DELEGATION_EVENTS.response, { ...request, nodeId: "other", status: "unavailable_context" });
      if (scenario === "duplicate") {
        events.emit(DELEGATION_EVENTS.response, { ...request, status: "unavailable_context" });
        events.emit(DELEGATION_EVENTS.response, { ...request, status: "unavailable_context" });
      }
    });
    const delegate = createDelegationRunner({ events });
    await assert.rejects(delegate({ agent: "a", task: "x" }, { cwd: "/repo" }), /delegation/);
  }
});

test("duplicate started remains the authoritative protocol error", async () => {
  const events = eventBus();
  events.on(DELEGATION_EVENTS.request, (request) => {
    events.emit(DELEGATION_EVENTS.started, request);
    events.emit(DELEGATION_EVENTS.started, request);
    events.emit(DELEGATION_EVENTS.response, { ...request, status: "completed", result: { kind: "text", text: "late success" } });
  });
  const delegate = createDelegationRunner({ events });
  await assert.rejects(
    delegate({ agent: "a", task: "x" }, { cwd: "/repo" }),
    /emitted duplicate started/,
  );
});

test("post-start duplicate, partial, and cancelled terminal paths reject", async () => {
  for (const scenario of ["duplicate", "partial", "cancel"]) {
    const events = eventBus();
    const controller = new AbortController();
    events.on(DELEGATION_EVENTS.request, (request) => {
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

test("advisor delegation uses the generic validated model path", async () => {
  const events = eventBus();
  const requests = [];
  events.on(DELEGATION_EVENTS.request, (request) => {
    requests.push(request);
    complete(events, request, "advice");
  });
  const delegate = createDelegationRunner({ events });
  const result = await delegate({
    agent: "advisor",
    task: "review",
    provider: "anthropic",
    model: "anthropic/claude-sonnet",
    thinking: "high",
  }, {
    cwd: "/repo",
    model: { provider: "openai-codex" },
    modelRegistry: [{ provider: "anthropic", id: "claude-sonnet" }],
  });
  assert.equal(result.results[0].request.model, "anthropic/claude-sonnet");
  assert.equal(result.results[0].request.thinking, "high");
  assert.equal(requests.length, 1);
});

test("Pi registration exposes evcrate_subagent without workflowScript", async () => {
  const events = eventBus();
  events.on(DELEGATION_EVENTS.request, (request) => complete(events, request));
  let tool;
  const pi = { events, on: () => {}, registerTool: (value) => { tool = value; } };
  registerDelegationTool(pi, {});
  assert.equal(tool.name, "evcrate_subagent");
  assert.match(tool.description, /Do not pass action or workflowScript/);
  assert.equal("workflowScript" in tool.parameters.properties, false);
  const result = await tool.execute("call", { agent: "a", task: "x" }, undefined, undefined, { cwd: "/repo", modelRegistry: [] });
  assert.equal(result.details.results[0].response.status, "completed");
});
