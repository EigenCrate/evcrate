import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-fix-x-ui",
  canonicalName: "fix/ui",
  description: "Analyze and fix UI issues",
  activation: true,
  template: "evc-cmd-fix-x-ui.md"
}, import.meta.url);
