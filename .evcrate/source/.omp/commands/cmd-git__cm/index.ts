import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-git__cm",
  canonicalName: "git/cm",
  description: "Stage all files and create a commit.",
  activation: false,
  template: "cmd-git__cm.md"
}, import.meta.url);
