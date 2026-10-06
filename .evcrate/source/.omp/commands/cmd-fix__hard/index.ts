import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-fix__hard",
  canonicalName: "fix/hard",
  description: "Use subagents to plan and fix hard issues",
  activation: true,
  template: "cmd-fix__hard.md"
}, import.meta.url);
