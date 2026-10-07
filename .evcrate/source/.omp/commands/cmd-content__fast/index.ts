import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-content__fast",
  canonicalName: "content/fast",
  description: "Write creative & smart copy [FAST]",
  activation: false,
  template: "cmd-content__fast.md"
}, import.meta.url);
