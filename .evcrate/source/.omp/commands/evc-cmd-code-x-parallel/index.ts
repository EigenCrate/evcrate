import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-code-x-parallel",
  canonicalName: "code/parallel",
  description: "Execute parallel or sequential phases based on plan structure",
  activation: true,
  template: "evc-cmd-code-x-parallel.md"
}, import.meta.url);
