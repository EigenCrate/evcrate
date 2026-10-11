import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-git-x-pr",
  canonicalName: "git/pr",
  description: "Create a pull request",
  template: "evc-cmd-git-x-pr.md"
}, import.meta.url);
