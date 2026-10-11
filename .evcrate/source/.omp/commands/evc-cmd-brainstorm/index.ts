import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-brainstorm",
  canonicalName: "brainstorm",
  description: "Brainstorm a feature",
  template: "evc-cmd-brainstorm.md"
}, import.meta.url);
