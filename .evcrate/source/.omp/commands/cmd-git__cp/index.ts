import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-git__cp",
  canonicalName: "git/cp",
  description: "Stage, commit and push all code in the current branch",
  activation: false,
  template: "cmd-git__cp.md"
}, import.meta.url);
