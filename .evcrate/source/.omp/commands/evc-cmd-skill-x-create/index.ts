import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-skill-x-create",
  canonicalName: "skill/create",
  description: "Create a new agent skill",
  activation: false,
  template: "evc-cmd-skill-x-create.md"
}, import.meta.url);
