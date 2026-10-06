import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-docs__update",
  canonicalName: "docs/update",
  description: "Analyze the codebase and update documentation",
  activation: false,
  template: "cmd-docs__update.md"
}, import.meta.url);
