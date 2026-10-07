import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-cook__auto__fast",
  canonicalName: "cook/auto/fast",
  description: "Low-risk fast cook: scout, plan fast, implement with quality gates",
  activation: true,
  template: "cmd-cook__auto__fast.md"
}, import.meta.url);
