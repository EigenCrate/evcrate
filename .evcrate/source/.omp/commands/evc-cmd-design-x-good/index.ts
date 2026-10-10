import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-design-x-good",
  canonicalName: "design/good",
  description: "Create an immersive design",
  activation: false,
  template: "evc-cmd-design-x-good.md"
}, import.meta.url);
