import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-test",
  canonicalName: "test",
  description: "Run tests locally and analyze the summary report.",
  activation: false,
  template: "cmd-test.md"
}, import.meta.url);
