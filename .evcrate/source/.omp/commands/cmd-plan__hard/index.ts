import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-plan__hard",
  canonicalName: "plan/hard",
  description: "Research, analyze, and create an implementation plan",
  activation: false,
  template: "cmd-plan__hard.md"
}, import.meta.url);
