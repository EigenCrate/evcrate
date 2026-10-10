import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-plan-x-archive",
  canonicalName: "plan/archive",
  description: "Write journal entries and archive specific plans or all plans",
  activation: false,
  template: "evc-cmd-plan-x-archive.md"
}, import.meta.url);
