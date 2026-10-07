import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-content__enhance",
  canonicalName: "content/enhance",
  description: "Analyze the current copy issues and enhance it",
  activation: false,
  template: "cmd-content__enhance.md"
}, import.meta.url);
