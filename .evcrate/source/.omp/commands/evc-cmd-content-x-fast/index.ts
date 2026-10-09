import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-content-x-fast",
  canonicalName: "content/fast",
  description: "Write creative & smart copy [FAST]",
  activation: false,
  template: "evc-cmd-content-x-fast.md"
}, import.meta.url);
