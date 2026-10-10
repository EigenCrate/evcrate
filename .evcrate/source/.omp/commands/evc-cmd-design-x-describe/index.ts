import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-design-x-describe",
  canonicalName: "design/describe",
  description: "Describe a design based on screenshot/video",
  activation: false,
  template: "evc-cmd-design-x-describe.md"
}, import.meta.url);
