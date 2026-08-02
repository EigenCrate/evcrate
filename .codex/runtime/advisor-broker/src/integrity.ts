import { createHash } from "node:crypto";
import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";

export class IntegrityError extends Error {}

async function hashFile(filePath: string): Promise<string> {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

async function treeHash(root: string): Promise<string> {
  const resolvedRoot = await realpath(root);
  const items: Array<{ path: string; relative: string; directory: boolean }> = [];
  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const candidate = path.join(directory, entry.name);
      const details = await lstat(candidate);
      const relative = path.relative(resolvedRoot, candidate).split(path.sep).join("/");
      if (details.isSymbolicLink()) throw new IntegrityError(`Generated artifact contains a symlink: ${relative}`);
      if (details.isDirectory()) {
        items.push({ path: candidate, relative, directory: true });
        await visit(candidate);
      } else if (details.isFile()) {
        items.push({ path: candidate, relative, directory: false });
      } else {
        throw new IntegrityError(`Generated artifact contains an unsupported path: ${relative}`);
      }
    }
  }
  await visit(resolvedRoot);
  const records: Buffer[] = [];
  for (const item of items.sort((left, right) => left.relative < right.relative ? -1 : left.relative > right.relative ? 1 : 0)) {
    records.push(item.directory ? Buffer.from(`d\0${item.relative}\n`) : Buffer.from(`f\0${item.relative}\0${await hashFile(item.path)}\n`));
  }
  return createHash("sha256").update(Buffer.concat(records)).digest("hex");
}

export async function verifyArtifactIntegrity(artifactRoot: string, manifestPath: string): Promise<void> {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { output_hashes?: { ".codex"?: unknown } };
  const expected = manifest.output_hashes?.[".codex"];
  if (typeof expected !== "string" || !/^[a-f0-9]{64}$/.test(expected)) {
    throw new IntegrityError("Build manifest has no valid Codex artifact hash");
  }
  if (await treeHash(artifactRoot) !== expected) {
    throw new IntegrityError("Generated Codex artifact does not match its build manifest");
  }
}
