import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-watzup",
  canonicalName: "watzup",
  description: "Review recent changes and wrap up the work",
  activation: false,
  template: "evc-cmd-watzup.md"
}, import.meta.url);
