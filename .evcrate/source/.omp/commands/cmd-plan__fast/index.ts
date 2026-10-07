import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-plan__fast",
  canonicalName: "plan/fast",
  description: "No research. Only analyze and create an implementation plan",
  activation: false,
  template: "cmd-plan__fast.md"
}, import.meta.url);
