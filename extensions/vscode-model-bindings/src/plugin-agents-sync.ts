import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RenderedAgentResult } from './agent-renderer.js';

export function syncPluginAgentsDirectory(
  pluginFsPath: string,
  renderedAgents: readonly RenderedAgentResult[]
): void {
  try {
    const agentsDir = join(pluginFsPath, 'com.github.copilot', 'agents');
    mkdirSync(agentsDir, { recursive: true });
    const desiredNames = new Set<string>();
    for (const agent of renderedAgents) {
      const fileName = `${agent.actorId}.agent.md`;
      desiredNames.add(fileName);
      const targetPath = join(agentsDir, fileName);
      if (existsSync(targetPath)) {
        try {
          if (readFileSync(targetPath, 'utf8') === agent.content) continue;
        } catch {}
      }
      writeFileSync(targetPath, agent.content, 'utf8');
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
