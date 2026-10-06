import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-skill__optimize",
  canonicalName: "skill/optimize",
  description: "Optimize an existing agent skill",
  activation: false,
  template: "cmd-skill__optimize.md"
}, import.meta.url);
