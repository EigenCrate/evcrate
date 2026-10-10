import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-code-x-auto",
  canonicalName: "code/auto",
  description: "[AUTO] Start coding & testing an existing plan (\"trust me bro\")",
  activation: true,
  template: "evc-cmd-code-x-auto.md"
}, import.meta.url);
