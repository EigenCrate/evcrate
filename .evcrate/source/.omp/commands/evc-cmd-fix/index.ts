import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-fix",
  canonicalName: "fix",
  description: "Analyze and fix issues [INTELLIGENT ROUTING]",
  activation: true,
  template: "evc-cmd-fix.md"
}, import.meta.url);
