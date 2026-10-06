import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-fix__types",
  canonicalName: "fix/types",
  description: "Fix type errors",
  activation: true,
  template: "cmd-fix__types.md"
}, import.meta.url);
