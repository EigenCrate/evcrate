import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-design-x-fast",
  canonicalName: "design/fast",
  description: "Create a quick design",
  activation: false,
  template: "evc-cmd-design-x-fast.md"
}, import.meta.url);
