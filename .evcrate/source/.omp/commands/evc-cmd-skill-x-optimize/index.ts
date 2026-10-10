import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-skill-x-optimize",
  canonicalName: "skill/optimize",
  description: "Optimize an existing agent skill",
  activation: false,
  template: "evc-cmd-skill-x-optimize.md"
}, import.meta.url);
