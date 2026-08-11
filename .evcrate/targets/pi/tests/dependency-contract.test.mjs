import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { createDelegationRunner } from "../files/agent/extensions/evcrate/delegation-tool.js";

const require = createRequire(import.meta.url);
const packageRoot = dirname(require.resolve("pi-subagents"));
const packageRequire = createRequire(pathToFileURL(join(packageRoot, "index.ts")));
const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));

function events() {
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

test("installed pi-subagents bridge accepts EVCrate structured delegation", async () => {
  assert.equal(packageJson.version, "0.44.0");
  const jiti = packageRequire("jiti")(import.meta.url, { interopDefault: true });
  const { normalizePublicSubagentExecution } = await jiti.import(pathToFileURL(
    join(packageRoot, "src", "extension", "public-execution.ts"),
  ).href);
  const { registerPromptTemplateDelegationBridge } = await jiti.import(pathToFileURL(
    join(packageRoot, "src", "slash", "prompt-template-bridge.ts"),
  ).href);
  const legacy = normalizePublicSubagentExecution({ agent: "worker", task: "legacy direct call" });
  assert.equal(legacy.ok, false);
  assert.match(legacy.error, /Direct execution was removed/);

  const bus = events();
  const terminals = [];
  let executed;
  bus.on("prompt-template:subagent:response", (response) => terminals.push(response));
  const bridge = registerPromptTemplateDelegationBridge({
    events: bus,
    getContext: () => ({ cwd: "/bridge-context" }),
    async executeStructured(requestId, params, _signal, context) {
      executed = { requestId, params, context };
      return {
        details: {
          results: [{
            agent: params.agent,
            model: params.model,
            thinking: params.delegatedThinkingOverride,
            finalOutput: "structured success",
          }],
        },
      };
    },
  });
  const delegate = createDelegationRunner({
    events: bus,
    createId: (() => { let id = 0; return () => String(++id); })(),
    resolveModel: () => ({ model: "test-model", thinking: "high" }),
  });

  try {
    const result = await delegate({
      agent: " worker ",
      task: " structured request ",
      context: "fork",
      timeoutMs: 1_000,
      turnBudget: { maxTurns: 2 },
      toolBudget: { hard: 3 },
      outputMode: "inline",
      skill: ["phase-03"],
      artifacts: true,
    }, { cwd: "/evcrate-context" });
    const delegated = result.results[0];

    assert.deepEqual(executed, {
      requestId: delegated.request.requestId,
      context: { cwd: "/bridge-context" },
      params: {
        agent: "worker",
        task: "structured request",
        context: "fork",
        cwd: "/evcrate-context",
        model: "test-model",
        timeoutMs: 1_000,
        turnBudget: { maxTurns: 2 },
        enforceHardTurnLimit: true,
        toolBudget: { hard: 3 },
        skill: ["phase-03"],
        output: false,
        acceptance: false,
        artifacts: true,
        delegatedThinkingOverride: "high",
        delegatedAllowZeroToolBudget: true,
        async: false,
        foregroundOnly: true,
        clarify: false,
      },
    });
    assert.equal(terminals.length, 1);
    assert.deepEqual(terminals[0], {
      requestId: delegated.request.requestId,
      ownerRunId: delegated.request.ownerRunId,
      nodeId: delegated.request.nodeId,
      status: "completed",
      agent: "worker",
      model: "test-model",
      thinking: "high",
      result: { kind: "text", text: "structured success" },
    });
    assert.strictEqual(delegated.response, terminals[0]);
  } finally {
    bridge.dispose();
  }
});
