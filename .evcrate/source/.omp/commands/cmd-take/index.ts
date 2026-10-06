import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-take",
  canonicalName: "take",
  description: "Transfer a feature from another project through compare, copy, improve, or port gates",
  activation: false,
  template: "cmd-take.md"
}, import.meta.url);
