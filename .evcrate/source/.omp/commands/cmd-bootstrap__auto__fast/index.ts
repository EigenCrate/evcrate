import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-bootstrap__auto__fast",
  canonicalName: "bootstrap/auto/fast",
  description: "Quickly bootstrap a new project automatically",
  activation: true,
  template: "cmd-bootstrap__auto__fast.md"
}, import.meta.url);
