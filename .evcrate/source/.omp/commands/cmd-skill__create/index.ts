import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-skill__create",
  canonicalName: "skill/create",
  description: "Create a new agent skill",
  activation: false,
  template: "cmd-skill__create.md"
}, import.meta.url);
