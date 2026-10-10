import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createProjectionBuildContext, createStagedRoot, loadTargetManifestRegistry } from "../../../../dist/index.js";
import { piAdapter } from "../../../../dist/adapters/pi/index.js";
import { translatePrompt } from "../../../../dist/adapters/pi/transforms.js";

import {
  discoverCommandFiles,
  expandCommandBody,
  MAX_COMMAND_OUTPUT_BYTES,
  MAX_COMMAND_OUTPUT_LINES,
  parseCommandFile,
  splitArguments,
  substituteArguments,
} from "../files/agent/extensions/evcrate/command-files.js";
import { executeBoundedShell } from "../files/agent/extensions/evcrate/commands.js";
import { resolveEvcrateMarkers } from "../files/agent/extensions/evcrate/paths.js";

function fixture() {
  return mkdtempSync(join(tmpdir(), "evcrate-command-files-"));
}

test("parses frontmatter and Claude-compatible quoted substitutions", () => {
  const parsed = parseCommandFile("---\ndescription: 'Run thing'\nargument-hint: [name]\ndisable-model-invocation: true\n---\nhello $ARGUMENTS");
  assert.equal(parsed.description, "Run thing");
  assert.equal(parsed.argumentHint, "[name]");
  assert.equal(parsed.disableModelInvocation, true);
  assert.deepEqual(splitArguments('one "two words" \'three words\''), ["one", "two words", "three words"]);
  assert.equal(
    substituteArguments("$ARGUMENTS|$@|$1|$2|${3:-third}|${ARGUMENTS:-all}", 'one "two words"'),
    "one \"two words\"|one \"two words\"|one|two words|third|one \"two words\"",
  );
  assert.throws(() => splitArguments("'unterminated"), /Unterminated/);
});

test("preserves raw substitutions without replacement-template or marker reinterpretation", async () => {
  const raw = " \t\"unmatched quote 'single quote \\trailing backslash $& $` $' $$ \r\nUnicode 雪 {{evcrate:workflows/missing.md}} !`printf injected` $ARGUMENTS $@ $1 ${ARGUMENTS:-nested} ";
  const cwd = fixture();
  try {
    assert.equal(substituteArguments("<$ARGUMENTS>|<$@>", raw), `<${raw}>|<${raw}>`);
    assert.equal(substituteArguments("${ARGUMENTS:-fallback}", ""), "fallback");
    assert.equal(substituteArguments("${ARGUMENTS:-fallback}", raw), raw);

    // Positional splitting is lazy: only positional placeholders invoke splitArguments
    assert.throws(() => substituteArguments("$1", raw), /Unterminated/);
    assert.throws(() => substituteArguments("${1:-fallback}", raw), /Unterminated/);

    const expanded = await expandCommandBody("$ARGUMENTS", raw, {
      cwd,
      execute: async () => assert.fail("raw arguments must not become authored shell"),
      resolveMarkers: (body) => body.replace("authored-marker", "resolved"),
    });
    assert.equal(expanded, raw);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("does not expand dynamic shell or file output containing argument placeholders", async () => {
  const cwd = fixture();
  try {
    const rawWithUnmatched = "literal 'unclosed \"quote \\backslash $ARGUMENTS $1 \r\n\t雪";
    writeFileSync(join(cwd, "dynamic.txt"), "file body with $ARGUMENTS and $1 and {{evcrate:workflows/missing.md}}");
    const executed = [];
    const result = await expandCommandBody(
      "prefix: $ARGUMENTS\n!`printf 'shell $ARGUMENTS $1'`\n@dynamic.txt\nsuffix: $ARGUMENTS",
      rawWithUnmatched,
      {
        cwd,
        execute: async (command) => {
          executed.push(command);
          return { code: 0, stdout: "shell stdout with $ARGUMENTS and $1 and {{evcrate:workflows/missing.md}}", stderr: "" };
        },
      },
    );
    assert.deepEqual(executed, ["printf 'shell $ARGUMENTS $1'"]);
    assert.match(result, new RegExp(`^prefix: ${rawWithUnmatched.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.match(result, /shell stdout with \$ARGUMENTS and \$1 and \{\{evcrate:workflows\/missing\.md\}\}/);
    assert.match(result, /file body with \$ARGUMENTS and \$1 and \{\{evcrate:workflows\/missing\.md\}\}/);
    assert.match(result, new RegExp(`suffix: ${rawWithUnmatched.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("discovers only contained regular markdown files", () => {
  const root = fixture();
  const outside = fixture();
  try {
    mkdirSync(join(root, "nested"));
    writeFileSync(join(root, "nested", "evc-cmd-nested.md"), "ignored: nested directory");
    writeFileSync(join(root, "evc-cmd-plan-x-hard.md"), "plan");
    writeFileSync(join(root, "plain.md"), "ignored: not a command name");
    writeFileSync(join(root, "evc-cmd-bad-x-x-name.md"), "ignored: reserved x token");
    writeFileSync(join(root, "skip.txt"), "skip");
    writeFileSync(join(outside, "escape.md"), "escape");
    symlinkSync(join(outside, "escape.md"), join(root, "evc-cmd-escape.md"));
    assert.deepEqual(
      discoverCommandFiles(root).map(({ name, canonicalName }) => ({ name, canonicalName })),
      [{ name: "evc-cmd-plan-x-hard", canonicalName: "plan/hard" }],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("expands only authored dynamic content outside fences before arguments", async () => {
  const cwd = fixture();
  try {
    writeFileSync(join(cwd, "inside.txt"), "inside");
    writeFileSync(join(cwd, "secret.txt"), "secret");
    const executed = [];
    const result = await expandCommandBody(
      "!`printf authored`\n@inside.txt\n```sh\n!`printf fenced`\n@secret.txt\n```\n$ARGUMENTS",
      "!`printf injected` @secret.txt",
      { cwd, execute: async (command) => { executed.push(command); return { code: 0, stdout: "authored", stderr: "" }; } },
    );
    assert.deepEqual(executed, ["printf authored"]);
    assert.match(result, /authored/);
    assert.match(result, /<file path="inside.txt">\ninside/);
    assert.match(result, /!`printf fenced`/);
    assert.match(result, /@secret.txt/);
    assert.match(result, /!`printf injected` @secret.txt/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("resolves contained markers and rejects missing, traversal, and escaping-symlink resources", () => {
  const agent = fixture();
  const outside = fixture();
  try {
    mkdirSync(join(agent, "evcrate", "scripts"), { recursive: true });
    mkdirSync(join(agent, "evcrate", "commands"), { recursive: true });
    mkdirSync(join(agent, "evcrate", "workflows"), { recursive: true });
    writeFileSync(join(agent, "evcrate", "scripts", "ok.cjs"), "ok");
    writeFileSync(join(agent, "evcrate", "commands", "evc-cmd-content-x-good.md"), "good");
    writeFileSync(join(agent, "evcrate", "commands", "evc-cmd-plan-x-two.md"), "literal");
    writeFileSync(join(outside, "bad.cjs"), "bad");
    symlinkSync(join(outside, "bad.cjs"), join(agent, "evcrate", "scripts", "bad.cjs"));
    const text = resolveEvcrateMarkers(
      "{{evcrate:scripts/ok.cjs}} {{evcrate:commands/evc-cmd-content-x-good}} {{evcrate:commands/evc-cmd-plan-x-two.md}} {{evcrate:workflows}}",
      agent,
    );
    assert.match(text, new RegExp(join(agent, "evcrate", "scripts", "ok\\.cjs")));
    assert.match(text, /name `evc-cmd-content-x-good`/);
    assert.match(text, /name `evc-cmd-plan-x-two`/);
    assert.match(text, new RegExp(join(agent, "evcrate", "workflows")));
    for (const marker of [
      "{{evcrate:../bad.cjs}}",
      "{{evcrate:scripts/bad.cjs}}",
      "{{evcrate:workflows/missing.md}}",
    ]) {
      assert.throws(() => resolveEvcrateMarkers(marker, agent), /resource is unavailable/);
    }
  } finally {
    rmSync(agent, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("canonical Pi command and main/child instructions read the installed HOME projection from a foreign cwd", (t) => {
  const root = fixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
  const stage = createStagedRoot(root);
  t.after(() => stage.cleanup());
  const registry = loadTargetManifestRegistry(join(repository, ".evcrate/targets/manifest.json"));
  const context = createProjectionBuildContext(registry.targets.get("pi"), join(repository, ".evcrate/source/.claude"), stage);
  piAdapter.build(context);
  const validation = piAdapter.validate(context);
  assert.equal(validation.valid, true, JSON.stringify(validation.diagnostics));
  const home = join(root, "home");
  cpSync(join(stage.path, ".pi"), join(home, ".pi"), { recursive: true });
  const foreignCwd = join(root, "foreign-project");
  const references = [
    "AGENTS.md",
    "workflows/advisor-mentoring.md",
    "workflows/advice-activation.md",
    "workflows/plan-progress.md",
    "workflows/development-rules.md",
  ];
  for (const prefix of [".pi/agent/evcrate", ".claude"]) {
    for (const reference of references) {
      const wrong = join(foreignCwd, prefix, reference);
      mkdirSync(dirname(wrong), { recursive: true });
      writeFileSync(wrong, "WRONG_FOREIGN_PAYLOAD");
    }
  }
  const extension = join(home, ".pi/agent/extensions/evcrate");
  const moduleUrl = (name) => JSON.stringify(pathToFileURL(join(extension, name)).href);
  const script = `
    import assert from "node:assert/strict";
    import { readFileSync, rmSync, writeFileSync } from "node:fs";
    import { basename, join } from "node:path";
    const { getInstalledAgentRoot } = await import(${moduleUrl("paths.js")});
    const { findManagedCommand, expandManagedCommand } = await import(${moduleUrl("commands.js")});
    const { registerHooks } = await import(${moduleUrl("hooks.js")});
    const { runChildStart } = await import(${moduleUrl("child-context.js")});
    const agentRoot = getInstalledAgentRoot(${moduleUrl("paths.js")});
    const resourceRoot = join(agentRoot, "evcrate");
    function readReference(body, reference) {
      const paths = [...body.matchAll(/\x60([^\x60\\n]+)\x60/g)]
        .map((match) => match[1]).filter((path) => basename(path) === basename(reference));
      assert.ok(paths.length > 0, "Missing resource reference: " + reference);
      for (const path of paths) {
        assert.equal(path, join(resourceRoot, reference));
        const contents = readFileSync(path, "utf8");
        assert.equal(contents, readFileSync(join(resourceRoot, reference), "utf8"));
        assert.notEqual(contents, "WRONG_FOREIGN_PAYLOAD");
        assert.ok(contents.trim());
      }
    }
    const command = findManagedCommand("evc-cmd-code", agentRoot);
    assert.ok(command);
    const rawArgs = "plans/selected.md {{evcrate:workflows/user-literal.md}}";
    const expanded = await expandManagedCommand(command, rawArgs, { cwd: process.cwd() }, { agentRoot });
    assert.ok(expanded.body.includes(rawArgs));
    for (const reference of ${JSON.stringify(references.slice(0, 4))}) readReference(expanded.body, reference);
    const handlers = new Map();
    const adapter = registerHooks({ on(name, handler) { handlers.set(name, handler); } }, {
      agentRoot, resourceRoot, hookMap: { schema: "evcrate-pi-hook-map-v1", events: {} },
    });
    const runtimeContext = { cwd: process.cwd(), sessionId: "installed-resource-consumer" };
    await handlers.get("session_start")({}, runtimeContext);
    const startup = await handlers.get("before_agent_start")({}, runtimeContext);
    for (const reference of ["AGENTS.md", "workflows/development-rules.md"]) {
      readReference(startup.message.content, reference);
    }
    assert.equal(startup.message.details.evcrateStartup, true);
    assert.equal(await handlers.get("before_agent_start")({}, runtimeContext), undefined);
    const startChild = () => runChildStart({
      runner: adapter.childStartRunner,
      canonicalEvent: { request: { cwd: process.cwd(), agent: "evc-tester", nodeId: "child" } },
      task: "Read required installed instructions",
      runtimeRoots: { resourceRoot },
    });
    const child = await startChild();
    for (const reference of ["AGENTS.md", "workflows/development-rules.md"]) {
      readReference(child.task, reference);
    }
    assert.ok(child.task.includes(child.additionalContext));
    assert.equal(startup.message.content, child.additionalContext);
    const required = join(resourceRoot, "workflows/development-rules.md");
    const saved = readFileSync(required);
    rmSync(required);
    await assert.rejects(handlers.get("session_compact")({}, runtimeContext));
    assert.deepEqual(await handlers.get("input")({}, runtimeContext), { action: "handled" });
    await assert.rejects(startChild(), /resource is unavailable/);
    writeFileSync(required, saved);
    assert.equal(await handlers.get("input")({}, runtimeContext), undefined);
    readReference((await handlers.get("before_agent_start")({}, runtimeContext)).message.content, "AGENTS.md");
  `;
  execFileSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: foreignCwd,
    env: { ...process.env, HOME: home, PI_CODING_AGENT_DIR: join(foreignCwd, ".pi/agent") },
    stdio: "pipe",
  });
});

test("Pi prompt resource markers bind project and HOME references while preserving URI literals and semantic identities", () => {
  const agent = fixture();
  try {
    for (const reference of ["AGENTS.md", "workflows/required.md", "scripts/required.cjs", "hooks/required.cjs"]) {
      const target = join(agent, "evcrate", reference);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, reference);
      const canonical = reference === "AGENTS.md" ? "rules/AGENTS.md" : reference;
      for (const prefix of ["", "./", "~/", "$HOME/", "\${HOME}/"]) {
        const resolved = resolveEvcrateMarkers(translatePrompt(prefix + ".claude/" + canonical), agent);
        assert.equal(resolved, target);
        assert.equal(readFileSync(resolved, "utf8"), reference);
      }
    }
    for (const literal of [
      "https://example.test/.claude/workflows/required.md",
      "file:///other/.claude/rules/AGENTS.md",
      "ssh://host/.claude/scripts/required.cjs",
      "AGENTS.override.md",
      "Claude Code CLI by Anthropic uses claude-sonnet; target: claude",
    ]) assert.equal(resolveEvcrateMarkers(translatePrompt(literal), agent), literal);
  } finally {
    rmSync(agent, { recursive: true, force: true });
  }
});

test("bounds shell output while draining stdout and stderr", async () => {
  const node = JSON.stringify(process.execPath);
  const bytes = await executeBoundedShell(
    `${node} -e 'process.stdout.write("x".repeat(60000)); process.stderr.write("y".repeat(60000))'`,
  );
  assert.equal(bytes.code, 0);
  assert.equal(Buffer.byteLength(bytes.stdout), MAX_COMMAND_OUTPUT_BYTES);
  assert.equal(Buffer.byteLength(bytes.stderr), MAX_COMMAND_OUTPUT_BYTES);

  const lines = await executeBoundedShell(
    `${node} -e 'process.stdout.write("line\\n".repeat(2500))'`,
  );
  assert.equal(lines.code, 0);
  assert.equal(lines.stdout.split("\n").length, MAX_COMMAND_OUTPUT_LINES);
});

test("terminates timed-out and aborted shells after streams are attached", async () => {
  const node = JSON.stringify(process.execPath);
  const command = `${node} -e 'setInterval(() => process.stdout.write("x"), 1)'`;
  await assert.rejects(executeBoundedShell(command, { timeout: 20 }), /timed out/);

  const controller = new AbortController();
  const running = executeBoundedShell(command, { signal: controller.signal });
  setTimeout(() => controller.abort(new Error("command aborted")), 20);
  await assert.rejects(running, /command aborted/);
});

test("terminates descendants with their timed-out shell process group", { skip: process.platform === "win32" }, async () => {
  const marker = join(fixture(), "grandchild.pid");
  const source = [
    'const fs = require("node:fs");',
    'const { spawn } = require("node:child_process");',
    'const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });',
    `fs.writeFileSync(${JSON.stringify(marker)}, String(child.pid));`,
    'setInterval(() => {}, 1000);',
  ].join("");
  try {
    await assert.rejects(executeBoundedShell(`${JSON.stringify(process.execPath)} -e ${JSON.stringify(source)}`, { timeout: 50 }), /timed out/);
    const pid = Number(readFileSync(marker, "utf8"));
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.throws(() => process.kill(pid, 0), /ESRCH/);
  } finally { rmSync(join(marker, ".."), { recursive: true, force: true }); }
});
