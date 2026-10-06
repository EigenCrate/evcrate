import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-bootstrap",
  canonicalName: "bootstrap",
  description: "Bootstrap a new project step by step",
  activation: true,
  template: "cmd-bootstrap.md"
}, import.meta.url);
