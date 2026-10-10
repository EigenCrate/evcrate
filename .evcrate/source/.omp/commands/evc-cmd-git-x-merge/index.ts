import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-git-x-merge",
  canonicalName: "git/merge",
  description: "⚠️ Merge code from one branch to another",
  activation: false,
  template: "evc-cmd-git-x-merge.md"
}, import.meta.url);
