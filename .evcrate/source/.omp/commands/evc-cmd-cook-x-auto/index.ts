import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-cook-x-auto",
  canonicalName: "cook/auto",
  description: "Implement a feature automatically with plan and quality gates",
  activation: true,
  template: "evc-cmd-cook-x-auto.md"
}, import.meta.url);
