import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-skill-x-plan",
  canonicalName: "skill/plan",
  description: "Plan to create a new agent skill",
  activation: false,
  template: "evc-cmd-skill-x-plan.md"
}, import.meta.url);
