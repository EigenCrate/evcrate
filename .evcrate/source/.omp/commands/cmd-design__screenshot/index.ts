import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-design__screenshot",
  canonicalName: "design/screenshot",
  description: "Create a design based on screenshot",
  activation: false,
  template: "cmd-design__screenshot.md"
}, import.meta.url);
