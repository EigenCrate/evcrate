import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-debug",
  canonicalName: "debug",
  description: "Debugging technical issues and providing solutions.",
  activation: false,
  template: "cmd-debug.md"
}, import.meta.url);
