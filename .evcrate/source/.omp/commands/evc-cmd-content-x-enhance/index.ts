import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-content-x-enhance",
  canonicalName: "content/enhance",
  description: "Analyze the current copy issues and enhance it",
  activation: false,
  template: "evc-cmd-content-x-enhance.md"
}, import.meta.url);
