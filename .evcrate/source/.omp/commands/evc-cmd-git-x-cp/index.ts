import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-git-x-cp",
  canonicalName: "git/cp",
  description: "Stage, commit and push all code in the current branch",
  activation: false,
  template: "evc-cmd-git-x-cp.md"
}, import.meta.url);
