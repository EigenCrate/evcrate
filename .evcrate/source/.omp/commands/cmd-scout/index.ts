import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "cmd-scout",
  canonicalName: "scout",
  description: "Scout given directories to respond to the user's requests",
  activation: false,
  template: "cmd-scout.md"
}, import.meta.url);
