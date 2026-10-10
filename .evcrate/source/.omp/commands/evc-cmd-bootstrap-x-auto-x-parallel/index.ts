import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-bootstrap-x-auto-x-parallel",
  canonicalName: "bootstrap/auto/parallel",
  description: "Bootstrap project with parallel execution",
  activation: true,
  template: "evc-cmd-bootstrap-x-auto-x-parallel.md"
}, import.meta.url);
