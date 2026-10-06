import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-git__merge",
  canonicalName: "git/merge",
  description: "⚠️ Merge code from one branch to another",
  activation: false,
  template: "cmd-git__merge.md"
}, import.meta.url);
