import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-fix-x-fast",
  canonicalName: "fix/fast",
  description: "Analyze and fix small issues [FAST]",
  activation: true,
  template: "evc-cmd-fix-x-fast.md"
}, import.meta.url);
