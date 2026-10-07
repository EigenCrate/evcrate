import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-cook__auto__parallel",
  canonicalName: "cook/auto/parallel",
  description: "Plan parallel phases & execute with fullstack-developer agents",
  activation: true,
  template: "cmd-cook__auto__parallel.md"
}, import.meta.url);
