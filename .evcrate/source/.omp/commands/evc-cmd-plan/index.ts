import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-plan",
  canonicalName: "plan",
  description: "Intelligent plan creation with prompt enhancement",
  activation: false,
  template: "evc-cmd-plan.md"
}, import.meta.url);
