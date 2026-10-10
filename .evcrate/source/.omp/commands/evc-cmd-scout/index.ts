import { createCommand } from '../../evcrate/omp-command-runtime.ts';

export default () => createCommand({
  name: "evc-cmd-scout",
  canonicalName: "scout",
  description: "Scout given directories to respond to the user's requests",
  activation: false,
  template: "evc-cmd-scout.md"
}, import.meta.url);
