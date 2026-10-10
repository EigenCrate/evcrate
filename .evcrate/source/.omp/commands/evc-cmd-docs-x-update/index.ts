import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-docs-x-update",
  canonicalName: "docs/update",
  description: "Analyze the codebase and update documentation",
  activation: false,
  template: "evc-cmd-docs-x-update.md"
}, import.meta.url);
