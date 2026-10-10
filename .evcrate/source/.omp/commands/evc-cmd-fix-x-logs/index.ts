import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-fix-x-logs",
  canonicalName: "fix/logs",
  description: "Analyze logs and fix issues",
  activation: true,
  template: "evc-cmd-fix-x-logs.md"
}, import.meta.url);
