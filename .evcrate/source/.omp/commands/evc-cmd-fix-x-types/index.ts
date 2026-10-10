import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-fix-x-types",
  canonicalName: "fix/types",
  description: "Fix type errors",
  activation: true,
  template: "evc-cmd-fix-x-types.md"
}, import.meta.url);
