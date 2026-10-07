import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-skill__fix-logs",
  canonicalName: "skill/fix-logs",
  description: "Fix the agent skill based on `logs.txt` file.",
  activation: false,
  template: "cmd-skill__fix-logs.md"
}, import.meta.url);
