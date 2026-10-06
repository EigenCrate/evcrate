import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-docs__summarize",
  canonicalName: "docs/summarize",
  description: "Analyze the codebase and update documentation",
  activation: false,
  template: "cmd-docs__summarize.md"
}, import.meta.url);
