import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-plan__two",
  canonicalName: "plan/two",
  description: "Research & create an implementation plan with 2 approaches",
  activation: false,
  template: "cmd-plan__two.md"
}, import.meta.url);
