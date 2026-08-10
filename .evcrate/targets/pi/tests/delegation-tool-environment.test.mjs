import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createDelegationRunner, DELEGATION_EVENTS } from "../files/agent/extensions/evcrate/delegation-tool.js";
import { complete, eventBus } from "./delegation-tool-test-helpers.mjs";

function restoreRoot(root) {
  if (root === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = root;
}

test("delegation corrects only an EVCrate resource-root environment", async () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "evcrate-agent-"));
  const agentRoot = join(fixtureRoot, "agent");
  const resourceRoot = join(agentRoot, "evcrate");
  const customRoot = mkdtempSync(join(tmpdir(), "evcrate-custom-"));
  const oldRoot = process.env.PI_CODING_AGENT_DIR;
  try {
    mkdirSync(resourceRoot, { recursive: true });
    const events = eventBus();
    const childRoots = [];
    const seenRoots = [];
    events.on(DELEGATION_EVENTS.request, (request) => {
      seenRoots.push(process.env.PI_CODING_AGENT_DIR);
      complete(events, request);
    });
    const delegate = createDelegationRunner({
      events,
      childStartRunner: async () => { childRoots.push(process.env.PI_CODING_AGENT_DIR); },
    });
    process.env.PI_CODING_AGENT_DIR = resourceRoot;
    await delegate({ agent: "planner", task: "plan" }, { cwd: "/repo" });
    assert.equal(process.env.PI_CODING_AGENT_DIR, resourceRoot);
    process.env.PI_CODING_AGENT_DIR = customRoot;
    await delegate({ agent: "planner", task: "plan" }, { cwd: "/repo" });
    assert.equal(process.env.PI_CODING_AGENT_DIR, customRoot);
    assert.deepEqual(childRoots, [agentRoot, customRoot]);
    assert.deepEqual(seenRoots, [agentRoot, customRoot]);
  } finally {
    restoreRoot(oldRoot);
    rmSync(fixtureRoot, { recursive: true, force: true });
    rmSync(customRoot, { recursive: true, force: true });
  }
});

test("delegation restores a corrected root when child start fails", async () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "evcrate-agent-"));
  const resourceRoot = join(fixtureRoot, "agent", "evcrate");
  const oldRoot = process.env.PI_CODING_AGENT_DIR;
  try {
    process.env.PI_CODING_AGENT_DIR = resourceRoot;
    const delegate = createDelegationRunner({
      events: eventBus(),
      childStartRunner: async () => { throw new Error("child start failed"); },
    });
    await assert.rejects(delegate({ agent: "planner", task: "plan" }, { cwd: "/repo" }), /child start failed/);
    assert.equal(process.env.PI_CODING_AGENT_DIR, resourceRoot);
  } finally {
    restoreRoot(oldRoot);
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("parallel delegation keeps a corrected root until every child settles", async () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "evcrate-agent-"));
  const resourceRoot = join(fixtureRoot, "agent", "evcrate");
  const agentRoot = join(fixtureRoot, "agent");
  const oldRoot = process.env.PI_CODING_AGENT_DIR;
  let releaseSlowStart, markSlowStart;
  const slowStart = new Promise((resolve) => { markSlowStart = resolve; });
  const release = new Promise((resolve) => { releaseSlowStart = resolve; });
  try {
    process.env.PI_CODING_AGENT_DIR = resourceRoot;
    const events = eventBus();
    const seenRoots = [];
    events.on(DELEGATION_EVENTS.request, (request) => {
      seenRoots.push(process.env.PI_CODING_AGENT_DIR);
      complete(events, request);
    });
    const delegate = createDelegationRunner({
      events,
      childStartRunner: async (event) => {
        if (event.request.agent === "slow") { markSlowStart(); await release; }
      },
    });
    const result = delegate({ mode: "parallel", nodes: [{ agent: "fast", task: "fast" }, { agent: "slow", task: "slow" }] }, { cwd: "/repo" });
    await slowStart;
    assert.equal(process.env.PI_CODING_AGENT_DIR, agentRoot);
    releaseSlowStart();
    await result;
    assert.deepEqual(seenRoots, [agentRoot, agentRoot]);
    assert.equal(process.env.PI_CODING_AGENT_DIR, resourceRoot);
  } finally {
    restoreRoot(oldRoot);
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
