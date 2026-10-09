import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-plan-x-two",
  canonicalName: "plan/two",
  description: "Research & create an implementation plan with 2 approaches",
  activation: false,
  template: "evc-cmd-plan-x-two.md"
}, import.meta.url);
