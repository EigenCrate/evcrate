import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-bootstrap",
  canonicalName: "bootstrap",
  description: "Bootstrap a new project step by step",
  template: "evc-cmd-bootstrap.md"
}, import.meta.url);
