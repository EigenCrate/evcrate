import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-coding-level",
  canonicalName: "coding-level",
  description: "Set your coding experience level for tailored explanations and output format.",
  activation: false,
  template: "cmd-coding-level.md"
}, import.meta.url);
