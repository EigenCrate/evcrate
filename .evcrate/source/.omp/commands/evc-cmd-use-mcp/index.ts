import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-use-mcp",
  canonicalName: "use-mcp",
  description: "Utilize tools of Model Context Protocol (MCP) servers",
  activation: false,
  template: "evc-cmd-use-mcp.md"
}, import.meta.url);
