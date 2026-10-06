import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-watzup",
  canonicalName: "watzup",
  description: "Review recent changes and wrap up the work",
  activation: false,
  template: "cmd-watzup.md"
}, import.meta.url);
