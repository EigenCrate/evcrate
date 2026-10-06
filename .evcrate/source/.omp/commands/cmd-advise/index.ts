import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-advise",
  canonicalName: "advise",
  description: "Interview-first technical advice; advisor relay is unsupported by OMP.",
  activation: false,
  template: "cmd-advise.md"
}, import.meta.url);
