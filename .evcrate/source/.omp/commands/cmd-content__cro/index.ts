import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-content__cro",
  canonicalName: "content/cro",
  description: "Analyze the current content and optimize for conversion",
  activation: false,
  template: "cmd-content__cro.md"
}, import.meta.url);
