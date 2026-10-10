import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-cook-x-auto-x-fast",
  canonicalName: "cook/auto/fast",
  description: "Low-risk fast cook: scout, plan fast, implement with quality gates",
  activation: true,
  template: "evc-cmd-cook-x-auto-x-fast.md"
}, import.meta.url);
