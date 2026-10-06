import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-fix__logs",
  canonicalName: "fix/logs",
  description: "Analyze logs and fix issues",
  activation: true,
  template: "cmd-fix__logs.md"
}, import.meta.url);
