import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-plan-x-hard",
  canonicalName: "plan/hard",
  description: "Research, analyze, and create an implementation plan",
  activation: false,
  template: "evc-cmd-plan-x-hard.md"
}, import.meta.url);
