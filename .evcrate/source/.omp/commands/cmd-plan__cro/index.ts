import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-plan__cro",
  canonicalName: "plan/cro",
  description: "Create a CRO plan for the given content",
  activation: false,
  template: "cmd-plan__cro.md"
}, import.meta.url);
