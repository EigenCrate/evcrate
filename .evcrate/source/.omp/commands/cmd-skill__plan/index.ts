import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-skill__plan",
  canonicalName: "skill/plan",
  description: "Plan to create a new agent skill",
  activation: false,
  template: "cmd-skill__plan.md"
}, import.meta.url);
