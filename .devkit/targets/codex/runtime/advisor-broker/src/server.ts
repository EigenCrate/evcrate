import { lstat, readFile, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { ZodError } from "zod";

import { createJsonlAudit, type AuditSink, type Usage } from "./audit.js";
import { createFakeAdapter, type AdvisorAdapter } from "./advisor-adapter.js";
import { AdviceSchema, AdvisorRequestSchema, type Advice, type AdvisorResponse } from "./contract.js";
import { createEvidenceReader, EvidenceError, type EvidenceReader } from "./evidence.js";
import { verifyArtifactIntegrity } from "./integrity.js";
import { loadRegistry, resolveAdvisorPolicy, type Registry } from "./registry.js";

const DEFAULT_ADVICE = { verdict: "escalate", recommendation: "Advisor adapter is not configured.", findings: [], assumptions: [] } satisfies Advice;

type BrokerDependencies = {
  registry: Registry;
  evidence: EvidenceReader;
  adapter: AdvisorAdapter;
  audit: AuditSink;
  prompt: string;
  now?: () => number;
  newRequestId?: () => string;
};

function failure(code: Extract<AdvisorResponse, { ok: false }>["code"], message: string, requestId: string): AdvisorResponse {
  return { ok: false, code, message, requestId };
}

async function auditFailure(audit: AuditSink, response: AdvisorResponse, latencyMs: number): Promise<void> {
  if (response.ok) return;
  try {
    await audit.record({ requestId: response.requestId, decision: "deny", reason: response.code, modelRole: "advisor", latencyMs });
  } catch {
    // An audit outage must not turn a controlled denial into a protocol failure.
  }
}

export async function consult(input: unknown, dependencies: BrokerDependencies): Promise<AdvisorResponse> {
  const now = dependencies.now ?? Date.now;
  const requestId = dependencies.newRequestId?.() ?? crypto.randomUUID();
  const started = now();
  try {
    const request = AdvisorRequestSchema.parse(input);
    const policy = resolveAdvisorPolicy(dependencies.registry, "codex");
    const evidence = await dependencies.evidence.read(request);
    let raw: unknown;
    try {
      raw = await dependencies.adapter.consult({ request, evidence, policy, prompt: dependencies.prompt });
    } catch {
      const response = failure("ADAPTER_FAILURE", "Advisor execution failed", requestId);
      await auditFailure(dependencies.audit, response, now() - started);
      return response;
    }
    const parsed = AdviceSchema.safeParse((raw as { advice?: unknown }).advice);
    if (!parsed.success) {
      const response = failure("ADAPTER_MALFORMED", "Advisor returned an invalid response", requestId);
      await auditFailure(dependencies.audit, response, now() - started);
      return response;
    }
    const usage = (raw as { usage?: Usage }).usage;
    const response: AdvisorResponse = { ok: true, requestId, advice: parsed.data };
    await dependencies.audit.record({
      requestId,
      decision: "allow",
      reason: "CONSULTED",
      modelRole: "advisor",
      model: policy.model,
      latencyMs: now() - started,
      verdict: parsed.data.verdict,
      ...(usage ? { usage } : {}),
    });
    return response;
  } catch (error) {
    const code = error instanceof ZodError ? "INVALID_REQUEST" : error instanceof EvidenceError ? "EVIDENCE_REJECTED" : "INTERNAL_ERROR";
    const message = code === "INVALID_REQUEST" ? "Request violates the advisor contract" : code === "EVIDENCE_REJECTED" ? "Advisor request was denied by evidence policy" : "Advisor broker failed internally";
    const response = failure(code, message, requestId);
    await auditFailure(dependencies.audit, response, now() - started);
    return response;
  }
}

export function createAdvisorServer(dependencies: BrokerDependencies): McpServer {
  const server = new McpServer({ name: "devkit-advisor-broker", version: "0.1.0" });
  server.registerTool("advisor_consult", {
    title: "Consult the constrained advisor",
    description: "Request one bounded, recommendation-only advisor consultation using allowlisted repository evidence.",
    inputSchema: AdvisorRequestSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (input) => {
    const result = await consult(input, dependencies);
    return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result, isError: !result.ok };
  });
  return server;
}

async function loadRuntimeContext(runtimeRoot: string): Promise<{ repositoryRoot: string; manifestPath: string }> {
  const contextPath = path.join(runtimeRoot, "runtime-context.json");
  const details = await lstat(contextPath);
  if (!details.isFile() || details.isSymbolicLink()) throw new Error("Runtime context is unsafe");
  const parsed = JSON.parse(await readFile(contextPath, "utf8")) as { schema_version?: unknown; repository_root?: unknown };
  if (parsed.schema_version !== 1 || typeof parsed.repository_root !== "string" || !path.isAbsolute(parsed.repository_root)) {
    throw new Error("Runtime context is invalid");
  }
  const repositoryRoot = await realpath(parsed.repository_root);
  if (!(await stat(repositoryRoot)).isDirectory()) throw new Error("Runtime repository root is unavailable");
  return { repositoryRoot, manifestPath: path.join(repositoryRoot, ".devkit", "build-manifest.json") };
}

async function main(): Promise<void> {
  const filePath = fileURLToPath(import.meta.url);
  const artifactRoot = path.resolve(path.dirname(filePath), "../../..");
  const runtimeRoot = path.resolve(path.dirname(filePath), "..");
  const { repositoryRoot, manifestPath } = await loadRuntimeContext(runtimeRoot);
  await verifyArtifactIntegrity(artifactRoot, manifestPath);
  const registry = await loadRegistry(path.join(path.dirname(filePath), "../registry.json"));
  const evidence = await createEvidenceReader([repositoryRoot]);
  const prompt = await readFile(path.join(path.dirname(filePath), "../prompts/advisor.md"), "utf8");
  const audit = createJsonlAudit(path.join(homedir(), ".local/state/devkit/advisor/audit.jsonl"));
  const server = createAdvisorServer({ registry, evidence, audit, prompt, adapter: createFakeAdapter({ advice: DEFAULT_ADVICE }) });
  await server.connect(new StdioServerTransport());
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => { console.error("Advisor broker startup failed", error); process.exitCode = 1; });
}
