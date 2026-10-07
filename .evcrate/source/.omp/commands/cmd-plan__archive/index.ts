import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-plan__archive",
  canonicalName: "plan/archive",
  description: "Write journal entries and archive specific plans or all plans",
  activation: false,
  template: "cmd-plan__archive.md"
}, import.meta.url);
