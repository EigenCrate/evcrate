import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-test-x-ui",
  canonicalName: "test/ui",
  description: "Run UI tests on a website & generate a detailed report.",
  activation: false,
  template: "evc-cmd-test-x-ui.md"
}, import.meta.url);
