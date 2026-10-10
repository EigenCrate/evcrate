import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-bootstrap-x-auto-x-fast",
  canonicalName: "bootstrap/auto/fast",
  description: "Quickly bootstrap a new project automatically",
  activation: true,
  template: "evc-cmd-bootstrap-x-auto-x-fast.md"
}, import.meta.url);
