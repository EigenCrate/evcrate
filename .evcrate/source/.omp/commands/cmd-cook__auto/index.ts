import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-cook__auto",
  canonicalName: "cook/auto",
  description: "Implement a feature automatically with plan and quality gates",
  activation: true,
  template: "cmd-cook__auto.md"
}, import.meta.url);
