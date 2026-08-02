import { lstat, realpath, stat, readFile } from "node:fs/promises";
import path from "node:path";

import type { AdvisorRequest } from "./contract.js";

const MAX_FILE_BYTES = 32_000;
const MAX_TOTAL_CHARS = 12_000;
const MAX_LINES_PER_FILE = 120;

export type EvidenceExcerpt = { path: string; text: string; redactions: number };

export class EvidenceError extends Error {}

export type EvidenceReader = { read(request: AdvisorRequest): Promise<EvidenceExcerpt[]> };

function redactSecrets(text: string): { text: string; count: number } {
  const patterns = [
    /\b(sk-(?:proj-)?[A-Za-z0-9_-]{20,})\b/g,
    /\b(gh[pousr]_[A-Za-z0-9]{20,})\b/g,
    /\b(AKIA[0-9A-Z]{16})\b/g,
    /((?:api[_-]?key|secret|token|password)\s*[:=]\s*)[^\s"']+/gi,
    /(-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----)[\s\S]*?(-----END(?: [A-Z]+)? PRIVATE KEY-----)/g,
  ];
  let count = 0;
  let redacted = text;
  for (const pattern of patterns) {
    redacted = redacted.replace(pattern, (match, prefix?: string) => {
      count += 1;
      return prefix?.includes("=") || prefix?.includes(":") ? `${prefix}[REDACTED]` : "[REDACTED]";
    });
  }
  return { text: redacted, count };
}

function isContained(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

async function assertNoSymlinkSegments(root: string, requestedPath: string): Promise<void> {
  const parts = requestedPath.split(/[\\/]/);
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    throw new EvidenceError("Evidence path must be normalized and relative");
  }
  let current = root;
  for (const part of parts) {
    current = path.join(current, part);
    const details = await lstat(current).catch(() => {
      throw new EvidenceError(`Evidence file is unavailable: ${requestedPath}`);
    });
    if (details.isSymbolicLink()) throw new EvidenceError("Evidence symlinks are not allowed");
  }
}

export async function createEvidenceReader(roots: string[]): Promise<EvidenceReader> {
  if (roots.length === 0) throw new EvidenceError("No evidence roots are configured");
  const realRoots = await Promise.all(roots.map((root) => realpath(root)));
  const primaryRoot = realRoots[0];
  if (!primaryRoot) throw new EvidenceError("No evidence roots are configured");

  return {
    async read(request): Promise<EvidenceExcerpt[]> {
      let totalChars = 0;
      const excerpts: EvidenceExcerpt[] = [];
      for (const requested of request.evidence) {
        if (path.isAbsolute(requested.path) || requested.path.includes("\0")) {
          throw new EvidenceError("Evidence path must be relative");
        }
        await assertNoSymlinkSegments(primaryRoot, requested.path);
        const joined = path.resolve(primaryRoot, requested.path);
        const resolved = await realpath(joined).catch(() => {
          throw new EvidenceError(`Evidence file is unavailable: ${requested.path}`);
        });
        const root = realRoots.find((candidate) => isContained(candidate, resolved));
        if (!root || !isContained(root, joined)) throw new EvidenceError("Evidence path escapes an allowed root");
        const details = await stat(resolved);
        if (!details.isFile() || details.size > MAX_FILE_BYTES) {
          throw new EvidenceError(`Evidence file exceeds the ${MAX_FILE_BYTES}-byte policy`);
        }
        const raw = await readFile(resolved, "utf8");
        if (raw.includes("\0")) throw new EvidenceError("Evidence must be text");
        const lines = raw === "" ? [] : raw.replace(/\r?\n$/, "").split(/\r?\n/);
        const start = (requested.startLine ?? 1) - 1;
        const requestedEnd = requested.endLine;
        if (start >= lines.length || (requestedEnd !== undefined && requestedEnd > lines.length)) {
          throw new EvidenceError("Evidence line range is outside the file");
        }
        const end = Math.min(requestedEnd ?? lines.length, start + MAX_LINES_PER_FILE);
        const selected = lines.slice(start, end).join("\n");
        const redacted = redactSecrets(selected);
        totalChars += redacted.text.length;
        if (totalChars > MAX_TOTAL_CHARS) throw new EvidenceError("Evidence exceeds the total excerpt policy");
        excerpts.push({ path: path.relative(root, resolved), text: redacted.text, redactions: redacted.count });
      }
      return excerpts;
    },
  };
}

export const evidenceLimits = { MAX_FILE_BYTES, MAX_TOTAL_CHARS, MAX_LINES_PER_FILE };
