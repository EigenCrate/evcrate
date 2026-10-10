import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-design-x-3d",
  canonicalName: "design/3d",
  description: "Create immersive interactive 3D designs with Three.js",
  activation: false,
  template: "evc-cmd-design-x-3d.md"
}, import.meta.url);
