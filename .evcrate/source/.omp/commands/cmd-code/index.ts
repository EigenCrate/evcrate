import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-code",
  canonicalName: "code",
  description: "Start coding & testing an existing plan",
  activation: true,
  template: "cmd-code.md"
}, import.meta.url);
