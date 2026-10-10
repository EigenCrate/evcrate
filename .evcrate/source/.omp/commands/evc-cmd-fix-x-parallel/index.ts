import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-fix-x-parallel",
  canonicalName: "fix/parallel",
  description: "Analyze & fix issues with parallel evc-fullstack-developer agents",
  activation: true,
  template: "evc-cmd-fix-x-parallel.md"
}, import.meta.url);
