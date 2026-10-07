import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

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
