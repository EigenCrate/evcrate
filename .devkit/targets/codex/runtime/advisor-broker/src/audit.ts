import { constants } from "node:fs";
import { lstat, mkdir, open } from "node:fs/promises";
import path from "node:path";

export type Usage = { inputTokens: number; outputTokens: number };
export type AuditEvent = {
  requestId: string;
  decision: "allow" | "deny";
  reason: string;
  modelRole: "advisor";
  model?: string;
  latencyMs: number;
  verdict?: "proceed" | "revise" | "escalate";
  usage?: Usage;
};

export type AuditSink = { record(event: AuditEvent): Promise<void> };

export function createMemoryAudit(records: AuditEvent[] = []): AuditSink {
  return { record: async (event) => { records.push({ ...event }); } };
}

async function ensureSafeDirectory(directory: string): Promise<void> {
  const resolved = path.resolve(directory);
  const parsed = path.parse(resolved);
  let current = parsed.root;
  for (const segment of path.relative(parsed.root, resolved).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    await mkdir(current, { recursive: false, mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
    });
    const details = await lstat(current);
    if (!details.isDirectory() || details.isSymbolicLink()) throw new Error("Audit directory is unsafe");
  }
}

export function createJsonlAudit(filePath: string, clock: () => Date = () => new Date()): AuditSink {
  return {
    async record(event): Promise<void> {
      const directory = path.dirname(filePath);
      await ensureSafeDirectory(directory);
      const existing = await lstat(filePath).catch(() => undefined);
      if (existing?.isSymbolicLink() || (existing && !existing.isFile())) throw new Error("Audit file is unsafe");
      const record = { timestamp: clock().toISOString(), ...event };
      const handle = await open(filePath, constants.O_APPEND | constants.O_CREAT | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
      try {
        await handle.chmod(0o600);
        await handle.appendFile(`${JSON.stringify(record)}\n`, "utf8");
      } finally {
        await handle.close();
      }
    },
  };
}
