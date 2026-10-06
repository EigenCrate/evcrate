import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-fix__fast",
  canonicalName: "fix/fast",
  description: "Analyze and fix small issues [FAST]",
  activation: true,
  template: "cmd-fix__fast.md"
}, import.meta.url);
