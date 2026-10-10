import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-skill-x-optimize-x-auto",
  canonicalName: "skill/optimize/auto",
  description: "Optimize an existing agent skill [auto]",
  activation: false,
  template: "evc-cmd-skill-x-optimize-x-auto.md"
}, import.meta.url);
