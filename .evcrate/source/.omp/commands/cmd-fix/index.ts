import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-fix",
  canonicalName: "fix",
  description: "Analyze and fix issues [INTELLIGENT ROUTING]",
  activation: true,
  template: "cmd-fix.md"
}, import.meta.url);
