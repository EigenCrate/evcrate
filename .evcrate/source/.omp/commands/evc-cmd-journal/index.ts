import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-journal",
  canonicalName: "journal",
  description: "Write some journal entries.",
  activation: false,
  template: "evc-cmd-journal.md"
}, import.meta.url);
