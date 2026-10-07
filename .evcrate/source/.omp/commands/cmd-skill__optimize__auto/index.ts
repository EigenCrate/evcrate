import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-skill__optimize__auto",
  canonicalName: "skill/optimize/auto",
  description: "Optimize an existing agent skill [auto]",
  activation: false,
  template: "cmd-skill__optimize__auto.md"
}, import.meta.url);
