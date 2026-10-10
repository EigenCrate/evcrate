import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-bootstrap-x-auto",
  canonicalName: "bootstrap/auto",
  description: "Bootstrap a new project automatically",
  activation: true,
  template: "evc-cmd-bootstrap-x-auto.md"
}, import.meta.url);
