import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-test__ui",
  canonicalName: "test/ui",
  description: "Run UI tests on a website & generate a detailed report.",
  activation: false,
  template: "cmd-test__ui.md"
}, import.meta.url);
