import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createCommandDispatchState,
  dispatchManagedCommand,
} from "../files/agent/extensions/evcrate/command-tool.js";
import { expandManagedCommand } from "../files/agent/extensions/evcrate/commands.js";

function fixture() {
  const agentRoot = mkdtempSync(join(tmpdir(), "evcrate-command-tool-"));
  const commands = join(agentRoot, "evcrate", "commands");
  mkdirSync(commands, { recursive: true });
  return { agentRoot, commands };
}

function context(root) {
  return { cwd: root, signal: undefined };
}

test("dispatches an exact, discovered command body", async () => {
  const { agentRoot, commands } = fixture();
  try {
    writeFileSync(join(commands, "plan.md"), "---\ndescription: Plan\n---\nplan $1");
    const result = await dispatchManagedCommand({ name: "plan", args: '"safe task"' }, context(agentRoot), {
      agentRoot,
      execute: async () => ({ code: 0, stdout: "", stderr: "" }),
    });
    assert.equal(result.command, "plan");
    assert.equal(result.body, "plan safe task");
  } finally {
    rmSync(agentRoot, { recursive: true, force: true });
  }
});

test("uses the bounded shell executor when no command executor is injected", async () => {
  const { agentRoot, commands } = fixture();
  try {
    const filePath = join(commands, "shell.md");
    writeFileSync(filePath, "!`printf managed`");
    const result = await expandManagedCommand({ filePath }, "", context(agentRoot), {
      agentRoot,
      pi: { exec: () => assert.fail("default execution must not use pi.exec") },
    });
    assert.equal(result.body, "managed");
  } finally {
    rmSync(agentRoot, { recursive: true, force: true });
  }
});

test("rejects unknown, disabled, repeated, and over-depth model dispatches", async () => {
  const { agentRoot, commands } = fixture();
  try {
    writeFileSync(join(commands, "open.md"), "open");
    writeFileSync(join(commands, "private.md"), "---\ndisable-model-invocation: true\n---\nprivate");
    const options = { agentRoot, execute: async () => ({ code: 0, stdout: "", stderr: "" }) };
    await assert.rejects(dispatchManagedCommand({ name: "missing" }, context(agentRoot), options), /Unknown/);
    await assert.rejects(dispatchManagedCommand({ name: "private" }, context(agentRoot), options), /disables model invocation/);

    const state = createCommandDispatchState();
    await dispatchManagedCommand({ name: "open" }, context(agentRoot), { ...options, state });
    await assert.rejects(dispatchManagedCommand({ name: "open" }, context(agentRoot), { ...options, state }), /cycle/);

    const depthState = createCommandDispatchState();
    await dispatchManagedCommand({ name: "open" }, context(agentRoot), { ...options, state: depthState, maxDepth: 1 });
    await assert.rejects(dispatchManagedCommand({ name: "other" }, context(agentRoot), { ...options, state: depthState, maxDepth: 1 }), /nesting depth/);

    const countState = createCommandDispatchState();
    await dispatchManagedCommand({ name: "open" }, context(agentRoot), { ...options, state: countState, maxDepth: 10, maxInvocations: 1 });
    await assert.rejects(dispatchManagedCommand({ name: "open" }, context(agentRoot), { ...options, state: countState, maxDepth: 10, maxInvocations: 1 }), /invocation limit/);
  } finally {
    rmSync(agentRoot, { recursive: true, force: true });
  }
});

test("releases a failed dispatch from cycle state", async () => {
  const { agentRoot, commands } = fixture();
  try {
    writeFileSync(join(commands, "retry.md"), "retry");
    const state = createCommandDispatchState();
    const options = {
      agentRoot,
      state,
      expand: async () => { throw new Error("expansion failed"); },
    };
    await assert.rejects(dispatchManagedCommand({ name: "retry" }, context(agentRoot), options), /expansion failed/);
    assert.equal(state.count, 0);
    assert.equal(state.names.size, 0);
  } finally {
    rmSync(agentRoot, { recursive: true, force: true });
  }
});
