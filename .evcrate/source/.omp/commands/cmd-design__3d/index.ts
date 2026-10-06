import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-design__3d",
  canonicalName: "design/3d",
  description: "Create immersive interactive 3D designs with Three.js",
  activation: false,
  template: "cmd-design__3d.md"
}, import.meta.url);
