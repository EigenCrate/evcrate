import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-ask",
  canonicalName: "ask",
  description: "Answer technical and architectural questions.",
  activation: false,
  template: "evc-cmd-ask.md"
}, import.meta.url);
