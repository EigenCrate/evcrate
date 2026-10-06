import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-plan__validate",
  canonicalName: "plan/validate",
  description: "Validate plan with critical questions interview",
  activation: false,
  template: "cmd-plan__validate.md"
}, import.meta.url);
