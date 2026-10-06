import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-scout__ext",
  canonicalName: "scout/ext",
  description: "Use external agentic tools to scout given directories",
  activation: false,
  template: "cmd-scout__ext.md"
}, import.meta.url);
