import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-advise",
  canonicalName: "advise",
  description: "Interview-first technical advice in the main session.",
  template: "evc-cmd-advise.md"
}, import.meta.url);
