import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-cook-x-auto-x-parallel",
  canonicalName: "cook/auto/parallel",
  description: "Plan parallel phases & execute with evc-fullstack-developer agents",
  activation: true,
  template: "evc-cmd-cook-x-auto-x-parallel.md"
}, import.meta.url);
