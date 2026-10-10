import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-plan-x-ci",
  canonicalName: "plan/ci",
  description: "Analyze Github Actions logs and provide a plan to fix the issues",
  activation: false,
  template: "evc-cmd-plan-x-ci.md"
}, import.meta.url);
