import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-design__video",
  canonicalName: "design/video",
  description: "Create a design based on video",
  activation: false,
  template: "cmd-design__video.md"
}, import.meta.url);
