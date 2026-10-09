import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-cook",
  canonicalName: "cook",
  description: "Implement a feature [step by step]",
  activation: true,
  template: "evc-cmd-cook.md"
}, import.meta.url);
