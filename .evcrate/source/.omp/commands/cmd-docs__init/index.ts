import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-docs__init",
  canonicalName: "docs/init",
  description: "Analyze the codebase and create initial documentation",
  activation: false,
  template: "cmd-docs__init.md"
}, import.meta.url);
