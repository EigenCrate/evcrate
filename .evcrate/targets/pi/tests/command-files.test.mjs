import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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

test("discovers only contained regular markdown files", () => {
  const root = fixture();
  const outside = fixture();
  try {
    mkdirSync(join(root, "nested"));
    writeFileSync(join(root, "nested", "run.md"), "run");
    writeFileSync(join(root, "skip.txt"), "skip");
    writeFileSync(join(outside, "escape.md"), "escape");
    symlinkSync(join(outside, "escape.md"), join(root, "escape.md"));
    assert.deepEqual(discoverCommandFiles(root).map((item) => item.name), ["nested:run"]);
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

test("resolves contained markers and leaves traversals and escaping symlinks literal", () => {
  const agent = fixture();
  const outside = fixture();
  try {
    mkdirSync(join(agent, "evcrate", "scripts"), { recursive: true });
    mkdirSync(join(agent, "evcrate", "commands", "content"), { recursive: true });
    writeFileSync(join(agent, "evcrate", "scripts", "ok.cjs"), "ok");
    writeFileSync(join(agent, "evcrate", "commands", "content", "good.md"), "good");
    writeFileSync(join(agent, "evcrate", "commands", "plan:two.md"), "literal");
    writeFileSync(join(outside, "bad.cjs"), "bad");
    symlinkSync(join(outside, "bad.cjs"), join(agent, "evcrate", "scripts", "bad.cjs"));
    const text = resolveEvcrateMarkers(
      "{{evcrate:scripts/ok.cjs}} {{evcrate:commands/content:good}} {{evcrate:commands/plan:two}} {{evcrate:../bad.cjs}} {{evcrate:scripts/bad.cjs}}",
      agent,
    );
    assert.match(text, new RegExp(join(agent, "evcrate", "scripts", "ok\\.cjs")));
    assert.match(text, /\{"name":"content:good","args":""\}/);
    assert.match(text, /\{"name":"plan:two","args":""\}/);
    assert.match(text, /{{evcrate:\.\.\/bad\.cjs}}/);
    assert.match(text, /{{evcrate:scripts\/bad\.cjs}}/);
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
