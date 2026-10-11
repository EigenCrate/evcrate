import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-test",
  canonicalName: "test",
  description: "Run tests locally and analyze the summary report.",
  template: "evc-cmd-test.md"
}, import.meta.url);
