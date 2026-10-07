import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-journal",
  canonicalName: "journal",
  description: "Write some journal entries.",
  activation: false,
  template: "cmd-journal.md"
}, import.meta.url);
