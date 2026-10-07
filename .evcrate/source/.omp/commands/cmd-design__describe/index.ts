import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-design__describe",
  canonicalName: "design/describe",
  description: "Describe a design based on screenshot/video",
  activation: false,
  template: "cmd-design__describe.md"
}, import.meta.url);
