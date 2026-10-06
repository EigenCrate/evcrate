import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-plan__ci",
  canonicalName: "plan/ci",
  description: "Analyze Github Actions logs and provide a plan to fix the issues",
  activation: false,
  template: "cmd-plan__ci.md"
}, import.meta.url);
