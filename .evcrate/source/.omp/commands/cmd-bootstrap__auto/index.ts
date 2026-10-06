import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-bootstrap__auto",
  canonicalName: "bootstrap/auto",
  description: "Bootstrap a new project automatically",
  activation: true,
  template: "cmd-bootstrap__auto.md"
}, import.meta.url);
