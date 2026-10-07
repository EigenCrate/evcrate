import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-plan__parallel",
  canonicalName: "plan/parallel",
  description: "Create detailed plan with parallel-executable phases",
  activation: false,
  template: "cmd-plan__parallel.md"
}, import.meta.url);
