import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-brainstorm",
  canonicalName: "brainstorm",
  description: "Brainstorm a feature",
  activation: false,
  template: "cmd-brainstorm.md"
}, import.meta.url);
