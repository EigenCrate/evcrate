import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-fix-x-hard",
  canonicalName: "fix/hard",
  description: "Use subagents to plan and fix hard issues",
  activation: true,
  template: "evc-cmd-fix-x-hard.md"
}, import.meta.url);
