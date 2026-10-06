import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-git__pr",
  canonicalName: "git/pr",
  description: "Create a pull request",
  activation: false,
  template: "cmd-git__pr.md"
}, import.meta.url);
