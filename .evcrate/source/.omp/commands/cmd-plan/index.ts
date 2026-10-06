import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-plan",
  canonicalName: "plan",
  description: "Intelligent plan creation with prompt enhancement",
  activation: false,
  template: "cmd-plan.md"
}, import.meta.url);
