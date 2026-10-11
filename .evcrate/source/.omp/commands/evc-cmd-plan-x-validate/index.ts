import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-plan-x-validate",
  canonicalName: "plan/validate",
  description: "Validate plan with critical questions interview",
  template: "evc-cmd-plan-x-validate.md"
}, import.meta.url);
