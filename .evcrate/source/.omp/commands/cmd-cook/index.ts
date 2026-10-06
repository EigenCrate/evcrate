import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-cook",
  canonicalName: "cook",
  description: "Implement a feature [step by step]",
  activation: true,
  template: "cmd-cook.md"
}, import.meta.url);
