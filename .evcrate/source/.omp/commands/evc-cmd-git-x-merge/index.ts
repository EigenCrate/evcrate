import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-git-x-merge",
  canonicalName: "git/merge",
  description: "⚠️ Merge code from one branch to another",
  template: "evc-cmd-git-x-merge.md"
}, import.meta.url);
