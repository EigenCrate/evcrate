import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { Type } from "typebox";
import { runChildStart } from "./child-context.js";
import { normalizeAgentRoot } from "./paths.js";
import { registerModelRoles, resolveExactAdvisorModel, resolveModelRole, validateExplicitModel, validateExplicitThinking } from "./model-roles.js";

export const DELEGATION_EVENTS = Object.freeze({
  request: "prompt-template:subagent:request",
  started: "prompt-template:subagent:started",
  update: "prompt-template:subagent:update",
  response: "prompt-template:subagent:response",
  cancel: "prompt-template:subagent:cancel",
});

export const DELEGATION_DESCRIPTION =
  "EVCrate structured delegation only: use agent/task or direct, parallel, and sequential nodes. "
  + "Do not pass action or workflowScript; those belong to pi-subagents' subagent tool.";

const DELEGATION_NODE_PARAMETERS = { type: "object", properties: { outputMode: { enum: ["inline"] } } };

export const DELEGATION_PARAMETERS = Type.Unsafe({
  type: "object",
  additionalProperties: false,
  properties: {
    mode: { enum: ["direct", "parallel", "sequential"] },
    agent: { type: "string" }, task: { type: "string" },
    nodes: { type: "array", items: DELEGATION_NODE_PARAMETERS },
    direct: DELEGATION_NODE_PARAMETERS, parallel: { type: "array", items: DELEGATION_NODE_PARAMETERS },
    sequential: { type: "array", items: DELEGATION_NODE_PARAMETERS },
    model: { type: "string" }, thinking: { type: "string" }, role: { type: "string" }, provider: { type: "string" },
    context: { enum: ["fresh", "fork"] }, cwd: { type: "string" }, timeoutMs: { type: "integer", minimum: 1 },
    result: { type: "object" }, turnBudget: { type: "object" }, toolBudget: { type: "object" },
    outputMode: { enum: ["inline"] }, skill: {}, artifacts: { type: "boolean" }, tasks: { type: "array", items: DELEGATION_NODE_PARAMETERS },
  },
});

function fail(message) { throw new Error(message); }
function text(value) { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function toolUpdate(value) {
  const currentTool = text(value?.currentTool);
  return {
    content: [{ type: "text", text: currentTool ? `Working: ${currentTool}` : "Delegation in progress" }],
    details: value,
  };
}
function normalizeChildAgentRoot(env = process.env) {
  const configured = env.PI_CODING_AGENT_DIR;
  if (!configured) return () => {};
  const resourceRoot = resolve(configured);
  const agentRoot = normalizeAgentRoot(resourceRoot);
  if (agentRoot === resourceRoot) return () => {};
  env.PI_CODING_AGENT_DIR = agentRoot;
  return () => { env.PI_CODING_AGENT_DIR = configured; };
}
function sameId(value, request) { return value?.requestId === request.requestId
  && value?.ownerRunId === request.ownerRunId && value?.nodeId === request.nodeId;
}
const TERMINAL_FAILURE_STATUSES = new Set([
  "failed", "timed_out", "cancelled", "interrupted", "turn_budget_exhausted", "tool_budget_exhausted",
  "structured_output_failed", "acceptance_failed", "invalid_request", "unavailable_context", "duplicate_node",
]);

function validResult(response, request) {
  if (response?.status !== "completed") return `delegation ${response?.status ?? "response"}`
    + `${response?.error ? `: ${response.error}` : ""}`;
  if (!response.result || response.result.kind !== request.result.kind) return "delegation completed without the requested result";
  if (request.result.kind === "text" && typeof response.result.text !== "string") return "delegation returned a partial text result";
  if (request.result.kind === "structured" && !("value" in response.result)) return "delegation returned a partial structured result";
  return undefined;
}

export function normalizeDelegation(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("delegation input must be an object");
  const mode = input?.mode ?? (Array.isArray(input?.parallel) ? "parallel" : Array.isArray(input?.sequential) ? "sequential" : "direct");
  const nodes = mode === "direct" ? [input?.direct ?? input] : input?.nodes ?? input?.tasks ?? input?.[mode];
  if (!(["direct", "parallel", "sequential"].includes(mode) && Array.isArray(nodes) && nodes.length)) fail("delegation requires a direct node or non-empty parallel/sequential nodes");
  const { mode: _mode, nodes: _nodes, tasks: _tasks, direct: _direct, parallel: _parallel, sequential: _sequential, ...shared } = input;
  if (shared.outputMode !== undefined && shared.outputMode !== "inline") fail("delegation outputMode must be inline");
  return { mode, nodes: nodes.map((node) => {
    const merged = { ...shared, ...node };
    if (!text(merged.agent) || !text(merged.task)) fail("each delegation node requires agent and task");
    if (merged.context !== undefined && merged.context !== "fresh" && merged.context !== "fork") fail("delegation context must be fresh or fork");
    if (merged.outputMode !== undefined && merged.outputMode !== "inline") fail("delegation outputMode must be inline");
    return { ...merged, agent: merged.agent.trim(), task: merged.task.trim(), context: merged.context ?? "fresh" };
  }) };
}

function waitForTerminal(events, request, signal, timeoutMs, onUpdate) {
  return new Promise((resolve, reject) => {
    let started = false, terminal, error, done = false;
    const cleanup = [];
    const finish = () => {
      if (done) return; done = true; cleanup.forEach((fn) => fn());
      error ? reject(new Error(error)) : resolve(terminal);
    };
    const queueFinish = () => queueMicrotask(finish);
    const fail = (message, value) => {
      if (done || error) return;
      error = message; terminal = value; queueFinish();
    };
    const rejectCorrelation = (value) => fail(`delegation response correlation failed for '${request.nodeId}'`, value);
    cleanup.push(events.on(DELEGATION_EVENTS.started, (value) => {
      if (value?.requestId !== request.requestId) return;
      if (!sameId(value, request)) return rejectCorrelation(value);
      if (started) fail(`delegation '${request.nodeId}' emitted duplicate started`);
      started = true;
    }));
    cleanup.push(events.on(DELEGATION_EVENTS.update, (value) => {
      if (value?.requestId !== request.requestId) return;
      if (!sameId(value, request)) return rejectCorrelation(value);
      onUpdate?.(toolUpdate(value));
    }));
    cleanup.push(events.on(DELEGATION_EVENTS.response, (value) => {
      if (value?.requestId !== request.requestId) return;
      if (!sameId(value, request)) return rejectCorrelation(value);
      if (terminal) {
        fail(`delegation '${request.nodeId}' emitted a duplicate or partial response`, value);
      } else if (!started && !TERMINAL_FAILURE_STATUSES.has(value?.status)) {
        fail(`delegation '${request.nodeId}' responded before started`, value);
      } else {
        const resultError = validResult(value, request);
        if (resultError) fail(resultError, value);
        else { terminal = value; queueFinish(); }
      }
    }));
    const cancel = (message) => {
      events.emit(DELEGATION_EVENTS.cancel, { requestId: request.requestId, ownerRunId: request.ownerRunId, nodeId: request.nodeId });
      fail(message);
    };
    const timer = setTimeout(() => cancel(`delegation '${request.nodeId}' timed out`), timeoutMs);
    cleanup.push(() => clearTimeout(timer));
    if (signal) {
      const onAbort = () => cancel(`delegation '${request.nodeId}' cancelled`);
      if (signal.aborted) onAbort();
      else {
        signal.addEventListener("abort", onAbort, { once: true });
        cleanup.push(() => signal.removeEventListener("abort", onAbort));
      }
    }
  });
}

export function createDelegationRunner(options) {
  const ids = options.createId ?? randomUUID;
  return async function delegate(input, context = {}) {
    const { mode, nodes } = normalizeDelegation(input);
    const ownerRunId = `evcrate-owner-${ids()}`;
    const restoreAgentRoot = normalizeChildAgentRoot();
    const runNode = async (node, index) => {
      const advisorRoute = node.agent === "advisor"
        ? resolveExactAdvisorModel({
          provider: node.provider,
          model: node.model,
          thinking: node.thinking,
          activeProvider: context.model?.provider,
          registry: context.modelRegistry,
        })
        : undefined;
      if (advisorRoute) {
        if (advisorRoute.error) fail(advisorRoute.error);
      } else {
        const explicitError = validateExplicitModel(node.model, context.modelRegistry) ?? validateExplicitThinking(node.thinking);
        if (explicitError) fail(explicitError);
      }
      const route = advisorRoute ?? options.resolveModel?.({ ...node, registry: context.modelRegistry }, context)
        ?? resolveModelRole({ ...options, ...node, registry: context.modelRegistry });
      if (route.error) fail(route.error);
      const request = {
        requestId: `evcrate-request-${ids()}`, ownerRunId, nodeId: `evcrate-node-${index}-${ids()}`,
        agent: node.agent, task: node.task, context: node.context, cwd: node.cwd ?? context.cwd,
        result: node.result ?? { kind: "text" }, timeoutMs: node.timeoutMs ?? input.timeoutMs ?? options.timeoutMs ?? 1_800_000,
        ...(node.turnBudget ? { turnBudget: node.turnBudget } : {}), ...(node.toolBudget ? { toolBudget: node.toolBudget } : {}),
        // outputMode is accepted locally for inline compatibility but is not supported by the public pi-subagents bridge.
        ...(node.skill !== undefined ? { skill: node.skill } : {}), ...(node.artifacts !== undefined ? { artifacts: node.artifacts } : {}),
        ...(route.model ? { model: route.model } : {}), ...(route.thinking ? { thinking: route.thinking } : {}),
      };
      if (!text(request.cwd)) fail("delegation requires cwd");
      const started = await runChildStart({
        runner: options.childStartRunner,
        canonicalEvent: { type: "SubagentStart", request, signal: context.signal },
        task: request.task,
        runtimeRoots: typeof options.runtimeRoots === "function" ? options.runtimeRoots(context) : options.runtimeRoots,
      });
      request.task = started.task;
      if (options.preflight && await options.preflight(request) === false) fail(`delegation '${request.nodeId}' failed preflight`);
      const response = waitForTerminal(options.events, request, context.signal, request.timeoutMs, context.onUpdate);
      options.events.emit(DELEGATION_EVENTS.request, request);
      return { request, response: await response };
    };
    try {
      const results = mode === "parallel" ? await Promise.allSettled(nodes.map(runNode)) : await sequential(nodes, runNode);
      const failures = results.filter((result) => result.status === "rejected");
      if (failures.length === 1) throw failures[0].reason;
      if (failures.length) throw new AggregateError(failures.map((item) => item.reason), `${failures.length} delegation node(s) failed`);
      return { ownerRunId, mode, results: results.map((item) => item.value) };
    } finally {
      restoreAgentRoot();
    }
  };
}

async function sequential(nodes, runNode) {
  const results = [];
  for (let index = 0; index < nodes.length; index += 1) {
    try { results.push({ status: "fulfilled", value: await runNode(nodes[index], index) }); }
    catch (reason) { results.push({ status: "rejected", reason }); break; }
  }
  return results;
}

export function registerDelegationTool(pi, options = {}) {
  const resolveModel = options.resolveModel ?? registerModelRoles(pi, options);
  const delegate = createDelegationRunner({ ...options, resolveModel, events: options.events ?? pi.events });
  pi.registerTool({
    name: "evcrate_subagent", label: "EVCrate Subagent",
    description: DELEGATION_DESCRIPTION,
    parameters: DELEGATION_PARAMETERS,
    async execute(_id, params, signal, onUpdate, ctx) {
      const result = await delegate(params, { cwd: ctx.cwd, model: ctx.model, modelRegistry: ctx.modelRegistry, signal, onUpdate });
      return { content: [{ type: "text", text: JSON.stringify(result) }], details: result };
    },
  });
  return delegate;
}
