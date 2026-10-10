import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-content-x-good",
  canonicalName: "content/good",
  description: "Write good creative & smart copy [GOOD]",
  activation: false,
  template: "evc-cmd-content-x-good.md"
}, import.meta.url);
