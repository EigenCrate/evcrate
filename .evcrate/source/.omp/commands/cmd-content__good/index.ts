import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-content__good",
  canonicalName: "content/good",
  description: "Write good creative & smart copy [GOOD]",
  activation: false,
  template: "cmd-content__good.md"
}, import.meta.url);
