import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-skill-x-fix-logs",
  canonicalName: "skill/fix-logs",
  description: "Fix the agent skill based on `logs.txt` file.",
  activation: false,
  template: "evc-cmd-skill-x-fix-logs.md"
}, import.meta.url);
