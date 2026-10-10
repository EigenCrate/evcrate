import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-worktree",
  canonicalName: "worktree",
  description: "Create isolated git worktree for parallel development",
  activation: false,
  template: "evc-cmd-worktree.md"
}, import.meta.url);
