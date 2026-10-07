import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-code__no-test",
  canonicalName: "code/no-test",
  description: "Start coding an existing plan (no testing)",
  activation: true,
  template: "cmd-code__no-test.md"
}, import.meta.url);
