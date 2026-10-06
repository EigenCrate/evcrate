import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-evcrate-help",
  canonicalName: "evcrate-help",
  description: "EVCrate usage guide - just type naturally",
  activation: false,
  template: "cmd-evcrate-help.md"
}, import.meta.url);
