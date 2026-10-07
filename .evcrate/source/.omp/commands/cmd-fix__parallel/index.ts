import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-fix__parallel",
  canonicalName: "fix/parallel",
  description: "Analyze & fix issues with parallel fullstack-developer agents",
  activation: true,
  template: "cmd-fix__parallel.md"
}, import.meta.url);
