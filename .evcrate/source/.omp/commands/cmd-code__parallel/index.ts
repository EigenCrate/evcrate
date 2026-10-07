import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-code__parallel",
  canonicalName: "code/parallel",
  description: "Execute parallel or sequential phases based on plan structure",
  activation: true,
  template: "cmd-code__parallel.md"
}, import.meta.url);
