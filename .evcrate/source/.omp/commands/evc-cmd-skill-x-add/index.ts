import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-skill-x-add",
  canonicalName: "skill/add",
  description: "Add new reference files or scripts to a skill",
  activation: false,
  template: "evc-cmd-skill-x-add.md"
}, import.meta.url);
