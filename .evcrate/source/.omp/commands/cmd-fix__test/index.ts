import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-fix__test",
  canonicalName: "fix/test",
  description: "Run test suite and fix issues",
  activation: true,
  template: "cmd-fix__test.md"
}, import.meta.url);
