import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-review-x-codebase",
  canonicalName: "review/codebase",
  description: "Scan & analyze the codebase.",
  activation: false,
  template: "evc-cmd-review-x-codebase.md"
}, import.meta.url);
