import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-ask",
  canonicalName: "ask",
  description: "Answer technical and architectural questions.",
  activation: false,
  template: "cmd-ask.md"
}, import.meta.url);
