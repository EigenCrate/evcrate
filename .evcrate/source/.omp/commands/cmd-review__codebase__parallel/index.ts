import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-review__codebase__parallel",
  canonicalName: "review/codebase/parallel",
  description: "Ultrathink edge cases, then parallel verify with code-reviewers",
  activation: false,
  template: "cmd-review__codebase__parallel.md"
}, import.meta.url);
