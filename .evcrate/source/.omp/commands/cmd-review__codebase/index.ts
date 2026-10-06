import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-review__codebase",
  canonicalName: "review/codebase",
  description: "Scan & analyze the codebase.",
  activation: false,
  template: "cmd-review__codebase.md"
}, import.meta.url);
