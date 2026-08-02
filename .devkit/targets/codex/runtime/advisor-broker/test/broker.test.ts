import { cp, lstat, mkdtemp, readFile, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { afterEach, describe, expect, it } from "vitest";

import { createJsonlAudit, createMemoryAudit, type AuditEvent } from "../src/audit.js";
import { createFakeAdapter } from "../src/advisor-adapter.js";
import { createEvidenceReader } from "../src/evidence.js";
import { loadRegistry } from "../src/registry.js";
import { consult } from "../src/server.js";

const temporaryPaths: string[] = [];
const registryPath = path.resolve(process.cwd(), "../../../../models.json");
const request = { kind: "security" as const, question: "Does the evidence preserve the advisor security boundary?", evidence: [{ path: "notes.txt" }] };
const advice = { verdict: "proceed" as const, recommendation: "Keep the bounded evidence path.", findings: [], assumptions: [] };

afterEach(async () => {
  await Promise.all(temporaryPaths.splice(0).map((directory) => import("node:fs/promises").then(({ rm }) => rm(directory, { recursive: true, force: true }))));
});

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "advisor-broker-"));
  temporaryPaths.push(root);
  await writeFile(path.join(root, "notes.txt"), "API_KEY=should-not-leak\nDecision evidence\n");
  return root;
}

describe("advisor broker", () => {
  it("rejects unknown request controls before adapter invocation", async () => {
    const root = await fixture();
    const records: AuditEvent[] = [];
    let calls = 0;
    const result = await consult({ ...request, model: "caller-choice" }, {
      registry: await loadRegistry(registryPath), evidence: await createEvidenceReader([root]), audit: createMemoryAudit(records), prompt: "test",
      adapter: { consult: async () => { calls += 1; return { advice }; } }, newRequestId: () => "request-1",
    });
    expect(result).toMatchObject({ ok: false, code: "INVALID_REQUEST" });
    expect(calls).toBe(0);
    expect(records).toEqual([expect.objectContaining({ reason: "INVALID_REQUEST" })]);
  });

  it("redacts secrets and rejects symlink escapes before provider work", async () => {
    const root = await fixture();
    const outside = path.join(root, "outside.txt");
    await writeFile(outside, "outside");
    await symlink(outside, path.join(root, "escape.txt"));
    await symlink(root, path.join(root, "linked-directory"));
    const reader = await createEvidenceReader([root]);
    const excerpts = await reader.read(request);
    expect(excerpts[0]?.text).toContain("[REDACTED]");
    await expect(reader.read({ ...request, evidence: [{ path: "escape.txt" }] })).rejects.toThrow("symlinks");
    await expect(reader.read({ ...request, evidence: [{ path: "linked-directory/notes.txt" }] })).rejects.toThrow("symlinks");
    const oneLine = await reader.read({ ...request, evidence: [{ path: "notes.txt", startLine: 1, endLine: 1 }] });
    expect(oneLine[0]?.text).toContain("[REDACTED]");
    await expect(reader.read({ ...request, evidence: [{ path: "notes.txt", startLine: 3, endLine: 3 }] })).rejects.toThrow("outside");
  });

  it("fails closed for malformed adapter output without a repair call", async () => {
    const root = await fixture();
    const records: AuditEvent[] = [];
    const result = await consult(request, {
      registry: await loadRegistry(registryPath), evidence: await createEvidenceReader([root]), audit: createMemoryAudit(records), prompt: "test",
      adapter: { consult: async () => ({ advice: { verdict: "bad" } }) }, newRequestId: () => "request-2",
    });
    expect(result).toMatchObject({ ok: false, code: "ADAPTER_MALFORMED" });
    expect(records).toEqual([expect.objectContaining({ reason: "ADAPTER_MALFORMED" })]);
  });

  it("audits metadata without evidence or recommendation text", async () => {
    const root = await fixture();
    const records: AuditEvent[] = [];
    const result = await consult(request, {
      registry: await loadRegistry(registryPath), evidence: await createEvidenceReader([root]), audit: createMemoryAudit(records), prompt: "private prompt",
      adapter: createFakeAdapter({ advice, usage: { inputTokens: 10, outputTokens: 5 } }), newRequestId: () => "request-3",
    });
    expect(result.ok).toBe(true);
    const serialized = JSON.stringify(records);
    expect(serialized).not.toContain("should-not-leak");
    expect(serialized).not.toContain(advice.recommendation);
    expect(records[0]).toMatchObject({ modelRole: "advisor", usage: { inputTokens: 10 } });
  });

  it("fails closed for internal adapter errors and refuses audit symlinks", async () => {
    const root = await fixture();
    const result = await consult(request, {
      registry: await loadRegistry(registryPath), evidence: await createEvidenceReader([root]), audit: createMemoryAudit(), prompt: "test",
      adapter: { consult: async () => { throw new Error("provider unavailable"); } }, newRequestId: () => "request-4",
    });
    expect(result).toMatchObject({ ok: false, code: "ADAPTER_FAILURE" });
    const auditPath = path.join(root, "audit.jsonl");
    await symlink(path.join(root, "notes.txt"), auditPath);
    await expect(createJsonlAudit(auditPath).record({ requestId: "audit-1", decision: "deny", reason: "test", modelRole: "advisor", latencyMs: 0 })).rejects.toThrow("unsafe");
    expect((await lstat(auditPath)).isSymbolicLink()).toBe(true);
  });

  it("uses INTERNAL_ERROR for unexpected broker failures and creates private audit files", async () => {
    const root = await fixture();
    const result = await consult(request, {
      registry: await loadRegistry(registryPath), evidence: { read: async () => { throw new Error("unexpected"); } }, audit: createMemoryAudit(), prompt: "test",
      adapter: createFakeAdapter({ advice }), newRequestId: () => "request-5",
    });
    expect(result).toMatchObject({ ok: false, code: "INTERNAL_ERROR" });
    const auditPath = path.join(root, "private", "audit.jsonl");
    await createJsonlAudit(auditPath).record({ requestId: "audit-2", decision: "allow", reason: "test", modelRole: "advisor", latencyMs: 0 });
    expect((await stat(auditPath)).mode & 0o777).toBe(0o600);
    expect(JSON.parse(await readFile(auditPath, "utf8"))).toMatchObject({ requestId: "audit-2" });
  });

  it("exposes exactly advisor_consult through stdio MCP", async () => {
    const projectRoot = path.resolve(process.cwd(), "../../../../..");
    const client = new Client({ name: "broker-test", version: "0.1.0" });
    const childEnv = Object.fromEntries(Object.entries(globalThis.process["env"]).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [path.join(projectRoot, ".codex/runtime/advisor-broker/dist/server.js")],
      cwd: projectRoot,
      env: { ...childEnv, ADVISOR_REGISTRY_PATH: "/untrusted", ADVISOR_EVIDENCE_ROOT: "/untrusted", ADVISOR_MANIFEST_PATH: "/untrusted" },
    });
    await client.connect(transport);
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual(["advisor_consult"]);
    await client.close();
  });

  it("starts from a HOME-published artifact using its integrity-verified project context", async () => {
    const projectRoot = path.resolve(process.cwd(), "../../../../..");
    const publishedHome = await mkdtemp(path.join(os.tmpdir(), "advisor-home-"));
    temporaryPaths.push(publishedHome);
    const publishedCodex = path.join(publishedHome, ".codex");
    await cp(path.join(projectRoot, ".codex"), publishedCodex, { recursive: true });
    const client = new Client({ name: "broker-home-test", version: "0.1.0" });
    const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(publishedCodex, "runtime/advisor-broker/dist/server.js")], cwd: projectRoot });
    await client.connect(transport);
    expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(["advisor_consult"]);
    await client.close();
  });
});
