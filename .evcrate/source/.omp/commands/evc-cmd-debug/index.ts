import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-debug",
  canonicalName: "debug",
  description: "Debugging technical issues and providing solutions.",
  activation: false,
  template: "evc-cmd-debug.md"
}, import.meta.url);
