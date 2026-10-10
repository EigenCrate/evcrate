import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-docs-x-summarize",
  canonicalName: "docs/summarize",
  description: "Analyze the codebase and update documentation",
  activation: false,
  template: "evc-cmd-docs-x-summarize.md"
}, import.meta.url);
