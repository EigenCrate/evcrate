import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-plan-x-fast",
  canonicalName: "plan/fast",
  description: "No research. Only analyze and create an implementation plan",
  activation: false,
  template: "evc-cmd-plan-x-fast.md"
}, import.meta.url);
