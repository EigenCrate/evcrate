import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-plan-x-cro",
  canonicalName: "plan/cro",
  description: "Create a CRO plan for the given content",
  activation: false,
  template: "evc-cmd-plan-x-cro.md"
}, import.meta.url);
