import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-fix-x-test",
  canonicalName: "fix/test",
  description: "Run test suite and fix issues",
  activation: true,
  template: "evc-cmd-fix-x-test.md"
}, import.meta.url);
