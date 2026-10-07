import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-skill__add",
  canonicalName: "skill/add",
  description: "Add new reference files or scripts to a skill",
  activation: false,
  template: "cmd-skill__add.md"
}, import.meta.url);
