import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-code__auto",
  canonicalName: "code/auto",
  description: "[AUTO] Start coding & testing an existing plan (\"trust me bro\")",
  activation: true,
  template: "cmd-code__auto.md"
}, import.meta.url);
