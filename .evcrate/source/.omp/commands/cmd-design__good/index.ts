import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-design__good",
  canonicalName: "design/good",
  description: "Create an immersive design",
  activation: false,
  template: "cmd-design__good.md"
}, import.meta.url);
