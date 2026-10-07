import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-bootstrap__auto__parallel",
  canonicalName: "bootstrap/auto/parallel",
  description: "Bootstrap project with parallel execution",
  activation: true,
  template: "cmd-bootstrap__auto__parallel.md"
}, import.meta.url);
