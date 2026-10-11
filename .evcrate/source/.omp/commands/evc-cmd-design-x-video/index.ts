import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-design-x-video",
  canonicalName: "design/video",
  description: "Create a design based on video",
  template: "evc-cmd-design-x-video.md"
}, import.meta.url);
