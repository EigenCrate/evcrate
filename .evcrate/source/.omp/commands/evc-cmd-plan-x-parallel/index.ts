import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-plan-x-parallel",
  canonicalName: "plan/parallel",
  description: "Create detailed plan with parallel-executable phases",
  activation: false,
  template: "evc-cmd-plan-x-parallel.md"
}, import.meta.url);
