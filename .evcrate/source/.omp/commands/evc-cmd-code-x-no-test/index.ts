import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-code-x-no-test",
  canonicalName: "code/no-test",
  description: "Start coding an existing plan (no testing)",
  activation: true,
  template: "evc-cmd-code-x-no-test.md"
}, import.meta.url);
