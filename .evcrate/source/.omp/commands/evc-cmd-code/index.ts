import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-code",
  canonicalName: "code",
  description: "Start coding & testing an existing plan",
  activation: true,
  template: "evc-cmd-code.md"
}, import.meta.url);
