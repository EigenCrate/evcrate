import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-fix__ui",
  canonicalName: "fix/ui",
  description: "Analyze and fix UI issues",
  activation: true,
  template: "cmd-fix__ui.md"
}, import.meta.url);
