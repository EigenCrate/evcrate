import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-scout-x-ext",
  canonicalName: "scout/ext",
  description: "Use external agentic tools to scout given directories",
  activation: false,
  template: "evc-cmd-scout-x-ext.md"
}, import.meta.url);
