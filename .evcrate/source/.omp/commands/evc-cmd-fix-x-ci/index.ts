import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-fix-x-ci",
  canonicalName: "fix/ci",
  description: "Analyze Github Actions logs and fix issues",
  activation: true,
  template: "evc-cmd-fix-x-ci.md"
}, import.meta.url);
