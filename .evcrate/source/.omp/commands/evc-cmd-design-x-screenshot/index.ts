import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-design-x-screenshot",
  canonicalName: "design/screenshot",
  description: "Create a design based on screenshot",
  activation: false,
  template: "evc-cmd-design-x-screenshot.md"
}, import.meta.url);
