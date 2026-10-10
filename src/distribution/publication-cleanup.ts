import { isPlainObject } from '../protocol/json.js';
import {
  publicationStateBindings, publicationStateDestination,
  type PublicationScope
} from '../protocol/publication-payloads.js';

// Cleanup is not an active binding: only Antigravity's recorded Gemini
// predecessor files are eligible, and only at their exact historical paths.
export function retiredBindingCleanupDestination(
  target: string, binding: string, path: string, scope: PublicationScope,
  selectedTargets: readonly string[], previous: Readonly<Record<string, unknown>>
): string | null {
  if (target !== 'gemini' || !selectedTargets.includes('antigravity')
    || !publicationStateBindings('gemini', scope, 'predecessor').includes(binding)) return null;
  const bindings = previous.gemini;
  if (!isPlainObject(bindings)) return null;
  const paths = bindings[binding];
  if (!Array.isArray(paths) || !paths.includes(path)) return null;
  return publicationStateDestination(binding, path, scope);
}
