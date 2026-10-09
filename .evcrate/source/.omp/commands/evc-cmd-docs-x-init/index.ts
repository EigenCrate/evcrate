import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-docs-x-init",
  canonicalName: "docs/init",
  description: "Analyze the codebase and create initial documentation",
  activation: false,
  template: "evc-cmd-docs-x-init.md"
}, import.meta.url);
