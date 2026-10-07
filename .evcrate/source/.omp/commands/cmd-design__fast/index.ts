import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-design__fast",
  canonicalName: "design/fast",
  description: "Create a quick design",
  activation: false,
  template: "cmd-design__fast.md"
}, import.meta.url);
