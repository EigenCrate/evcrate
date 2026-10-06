import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-fix__ci",
  canonicalName: "fix/ci",
  description: "Analyze Github Actions logs and fix issues",
  activation: true,
  template: "cmd-fix__ci.md"
}, import.meta.url);
