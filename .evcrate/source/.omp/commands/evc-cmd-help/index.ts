import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-help",
  canonicalName: "help",
  description: "EVCrate usage guide - just type naturally",
  template: "evc-cmd-help.md"
}, import.meta.url);
