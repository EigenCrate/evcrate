import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createCommandDispatchState, dispatchManagedCommand, registerCommandTool } from "../files/agent/extensions/evcrate/command-tool.js";
import { expandManagedCommand, registerManagedCommands } from "../files/agent/extensions/evcrate/commands.js";
function fixture() {
  const agentRoot = mkdtempSync(join(tmpdir(), "evcrate-command-tool-"));
  const commands = join(agentRoot, "evcrate", "commands");
  mkdirSync(commands, { recursive: true });
  return { agentRoot, commands };
}

function context(root) {
  return { cwd: root, signal: undefined };
}

function parseCommandContext(body) {
  const separator = body.indexOf("\n\n");
  assert.notEqual(separator, -1, "command context separator is missing");
  return {
    context: JSON.parse(body.slice(0, separator)).evcrate_command_context,
    body: body.slice(separator + 2),
  };
}

test("dispatches an exact discovered command with canonical model context", async () => {
  const { agentRoot, commands } = fixture();
  try {
    writeFileSync(join(commands, "evc-cmd-plan.md"), "---\ndescription: Plan\n---\nplan $1");
    const raw = '"safe task"';
    const result = await dispatchManagedCommand({ name: "evc-cmd-plan", args: raw }, context(agentRoot), {
      agentRoot,
      execute: async () => ({ code: 0, stdout: "", stderr: "" }),
    });
    const expanded = parseCommandContext(result.body);
    assert.equal(result.command, "evc-cmd-plan");
    assert.equal(result.canonicalCommand, "plan");
    assert.equal(expanded.body, "plan safe task");
    assert.deepEqual(expanded.context, {
      protocol: "evcrate-pi-command-context", version: 1, source: "model-tool",
      command: "plan", raw_arguments: raw, handoff: null,
    });
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

test("registered model tool carries exact raw work and direct handoff through real expansion", async () => {
  const { agentRoot, commands } = fixture();
  const handlers = new Map();
  const tools = new Map();
  try {
    writeFileSync(join(commands, "evc-cmd-code-x-auto.md"), "$ARGUMENTS");
    const pi = {
      on(name, handler) { handlers.set(name, handler); },
      registerTool(tool) { tools.set(tool.name, tool); },
    };
    await registerCommandTool(pi, { agentRoot });
    handlers.get("agent_start")?.();
    const raw = " \t\"$& $` $' $$\" 'unmatched-single \"unmatched-double \\trailing \r\n雪 {{evcrate:workflows/missing.md}} $ARGUMENTS ";
    const handoff = {
      kind: "pre-run",
      context: {
        project_root: agentRoot,
        command: "code/auto",
        work_target: "plans/demo/plan.md",
        plan_path: "plans/demo/plan.md",
        phase_path: null,
        phase_id: null,
      },
      run: null,
    };
    const result = await tools.get("evcrate_command").execute(
      "call-1",
      { name: "evc-cmd-code-x-auto", args: raw, handoff },
      undefined,
      undefined,
      context(agentRoot),
    );
    const expanded = parseCommandContext(result.content[0].text);
    assert.equal(expanded.body, raw);
    assert.equal(expanded.context.command, "code/auto");
    assert.equal(expanded.context.raw_arguments, raw);
    assert.deepEqual(expanded.context.handoff, handoff);
    assert.deepEqual(result.details, {
      command: "evc-cmd-code-x-auto", canonicalCommand: "code/auto", source: "model-tool", handoff,
    });
    handlers.get("agent_start")?.();
    const sameRun = {
      kind: "same-run",
      context: { ...handoff.context, phase_path: "plans/demo/phase-03.md", phase_id: "phase-03" },
      run: {
        task_run_id: "00000000-0000-4000-8000-000000000001", project_id: "a".repeat(64),
        task_revision: 4, scope_revision: 1, evidence_revision: 2,
      },
    };
    const continued = await tools.get("evcrate_command").execute(
      "call-2", { name: "evc-cmd-code-x-auto", args: "continue", handoff: sameRun },
      undefined, undefined, context(agentRoot),
    );
    assert.deepEqual(parseCommandContext(continued.content[0].text).context.handoff, sameRun);
  } finally {
    rmSync(agentRoot, { recursive: true, force: true });
  }
});

test("native command handler labels its transport and cannot claim model handoff", async () => {
  const { agentRoot, commands } = fixture();
  const handlers = new Map();
  const registered = new Map();
  const messages = [];
  try {
    writeFileSync(join(commands, "evc-cmd-code.md"), "$ARGUMENTS");
    const pi = {
      on(name, handler) { handlers.set(name, handler); },
      registerCommand(name, definition) { registered.set(name, definition); },
      sendUserMessage(message) { messages.push(message); },
    };
    registerManagedCommands(pi, { agentRoot });
    handlers.get("session_start")?.();
    const raw = "\tuser \"quote 'unmatched-single \\trailing \r\n雪 ";
    await registered.get("evc-cmd-code").handler(raw, context(agentRoot));
    const expanded = parseCommandContext(messages[0]);
    assert.equal(expanded.body, raw);
    assert.equal(expanded.context.source, "native-user");
    assert.equal(expanded.context.command, "code");
    assert.equal(expanded.context.raw_arguments, raw);
    assert.equal(expanded.context.handoff, null);
  } finally {
    rmSync(agentRoot, { recursive: true, force: true });
  }
});

test("rejects unknown, disabled, repeated, and over-depth model dispatches", async () => {
  const { agentRoot, commands } = fixture();
  try {
    writeFileSync(join(commands, "evc-cmd-open.md"), "open");
    writeFileSync(join(commands, "evc-cmd-private.md"), "---\ndisable-model-invocation: true\n---\nprivate");
    const options = { agentRoot, execute: async () => ({ code: 0, stdout: "", stderr: "" }) };
    await assert.rejects(dispatchManagedCommand({ name: "evc-cmd-missing" }, context(agentRoot), options), /Unknown/);
    await assert.rejects(dispatchManagedCommand({ name: "evc-cmd-private" }, context(agentRoot), options), /disables model invocation/);
    await assert.rejects(dispatchManagedCommand(
      { name: "evc-cmd-open", args: ["normalized"] }, context(agentRoot), options,
    ), /raw string args/);
    await assert.rejects(dispatchManagedCommand(
      { name: "evc-cmd-open", handoff: "discovered-json" }, context(agentRoot), options,
    ), /handoff must be an object or null/);
    await assert.rejects(dispatchManagedCommand(
      { name: "evc-cmd-open", handoff: ["invalid", "array"] }, context(agentRoot), options,
    ), /handoff must be an object or null/);
    await assert.rejects(dispatchManagedCommand(
      { name: "evc-cmd-open", handoff: true }, context(agentRoot), options,
    ), /handoff must be an object or null/);
    const state = createCommandDispatchState();
    await dispatchManagedCommand({ name: "evc-cmd-open" }, context(agentRoot), { ...options, state });
    await assert.rejects(dispatchManagedCommand({ name: "evc-cmd-open" }, context(agentRoot), { ...options, state }), /cycle/);

    const depthState = createCommandDispatchState();
    await dispatchManagedCommand({ name: "evc-cmd-open" }, context(agentRoot), { ...options, state: depthState, maxDepth: 1 });
    await assert.rejects(dispatchManagedCommand({ name: "evc-cmd-other" }, context(agentRoot), { ...options, state: depthState, maxDepth: 1 }), /nesting depth/);

    const countState = createCommandDispatchState();
    await dispatchManagedCommand({ name: "evc-cmd-open" }, context(agentRoot), { ...options, state: countState, maxDepth: 10, maxInvocations: 1 });
    await assert.rejects(dispatchManagedCommand({ name: "evc-cmd-open" }, context(agentRoot), { ...options, state: countState, maxDepth: 10, maxInvocations: 1 }), /invocation limit/);
  } finally {
    rmSync(agentRoot, { recursive: true, force: true });
  }
});

test("releases a failed dispatch from cycle state", async () => {
  const { agentRoot, commands } = fixture();
  try {
    writeFileSync(join(commands, "evc-cmd-retry.md"), "retry");
    const state = createCommandDispatchState();
    const options = {
      agentRoot,
      state,
      expand: async () => { throw new Error("expansion failed"); },
    };
    await assert.rejects(dispatchManagedCommand({ name: "evc-cmd-retry" }, context(agentRoot), options), /expansion failed/);
    assert.equal(state.count, 0);
    assert.equal(state.names.size, 0);
  } finally {
    rmSync(agentRoot, { recursive: true, force: true });
  }
});

test("fails closed when a resolved command carries no canonical identity", async () => {
  const { agentRoot } = fixture();
  try {
    const state = createCommandDispatchState();
    const options = { agentRoot, state, find: () => ({ name: "evc-cmd-open", filePath: "unused" }), read: () => ({ body: "open" }) };
    await assert.rejects(dispatchManagedCommand({ name: "evc-cmd-open" }, context(agentRoot), options), /no canonical identity/);
    assert.equal(state.count, 0);
    assert.equal(state.names.size, 0);
  } finally {
    rmSync(agentRoot, { recursive: true, force: true });
  }
});

