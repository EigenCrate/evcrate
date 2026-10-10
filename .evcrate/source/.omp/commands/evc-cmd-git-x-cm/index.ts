import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-git-x-cm",
  canonicalName: "git/cm",
  description: "Stage all files and create a commit.",
  activation: false,
  template: "evc-cmd-git-x-cm.md"
}, import.meta.url);
