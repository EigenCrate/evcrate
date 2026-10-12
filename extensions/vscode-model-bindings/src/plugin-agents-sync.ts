import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RenderedAgentResult } from './agent-renderer.js';

export function syncPluginAgentsDirectory(
  pluginFsPath: string,
  renderedAgents: readonly RenderedAgentResult[]
): void {
  try {
    if (!existsSync(pluginFsPath) || lstatSync(pluginFsPath).isSymbolicLink()) return;
    const copilotDir = join(pluginFsPath, 'com.github.copilot');
    if (existsSync(copilotDir) && lstatSync(copilotDir).isSymbolicLink()) return;
    const agentsDir = join(copilotDir, 'agents');
    if (existsSync(agentsDir) && lstatSync(agentsDir).isSymbolicLink()) return;
    mkdirSync(agentsDir, { recursive: true });
    const desiredNames = new Set<string>();
    for (const agent of renderedAgents) {
      const fileName = `${agent.actorId}.agent.md`;
      desiredNames.add(fileName);
      const targetPath = join(agentsDir, fileName);
      if (existsSync(targetPath)) {
        if (lstatSync(targetPath).isSymbolicLink()) {
          rmSync(targetPath, { force: true });
        } else {
          try {
            if (readFileSync(targetPath, 'utf8') === agent.content) continue;
          } catch {}
        }
      }
      const tmpPath = join(agentsDir, `.${fileName}.${process.pid}.tmp`);
      writeFileSync(tmpPath, agent.content, 'utf8');
      renameSync(tmpPath, targetPath);
    }
    for (const entry of readdirSync(agentsDir)) {
      if (entry.endsWith('.agent.md') && !desiredNames.has(entry)) {
        rmSync(join(agentsDir, entry), { force: true });
      }
    }
  } catch {
    // Non-fatal if plugin directory is read-only
  }
}
