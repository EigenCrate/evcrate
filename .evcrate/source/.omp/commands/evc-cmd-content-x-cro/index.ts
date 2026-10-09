import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-content-x-cro",
  canonicalName: "content/cro",
  description: "Analyze the current content and optimize for conversion",
  activation: false,
  template: "evc-cmd-content-x-cro.md"
}, import.meta.url);
