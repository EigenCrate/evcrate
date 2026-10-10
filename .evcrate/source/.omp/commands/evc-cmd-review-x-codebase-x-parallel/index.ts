import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-review-x-codebase-x-parallel",
  canonicalName: "review/codebase/parallel",
  description: "Ultrathink edge cases, then parallel verify with code-reviewers",
  activation: false,
  template: "evc-cmd-review-x-codebase-x-parallel.md"
}, import.meta.url);
