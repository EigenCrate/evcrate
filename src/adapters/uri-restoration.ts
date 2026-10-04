/**
 * Shared linear URI and token restoration utilities for target projection adapters.
 */

/**
 * Restores protected tokens in text using a linear single-pass regex callback
 * for common cases, while falling back to the legacy sequential replaceAll loop
 * when replacement-template ($$, $&, etc.) or token collision/cascade patterns are detected.
 */
export function restoreIndexedTokens(
  text: string,
  tokenPrefix: string,
  saved: readonly string[] | readonly (readonly [string, string])[]
): string {
  if (saved.length === 0) return text;

  // Inspect bounded table for semantic exceptions ($ templates or token collisions)
  let hasException = false;
  for (let i = 0; i < saved.length; i += 1) {
    const entry = saved[i];
    const orig = typeof entry === 'string' ? entry : entry[1];
    if (orig.includes('$') || orig.includes(tokenPrefix)) {
      hasException = true;
      break;
    }
  }

  // Isolated legacy-semantics branch: preserves exact replacement-template and cascade behavior
  if (hasException) {
    let result = text;
    for (let i = 0; i < saved.length; i += 1) {
      const entry = saved[i];
      const token = typeof entry === 'string' ? `${tokenPrefix}${i}__` : entry[0];
      const orig = typeof entry === 'string' ? entry : entry[1];
      result = result.replaceAll(token, orig);
    }
    return result;
  }

  // Common-case: linear single-pass regex callback (O(N) with text and table size)
  const escapedPrefix = tokenPrefix.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const regex = new RegExp(`${escapedPrefix}(\\d+)__`, 'gu');
  return text.replace(regex, (match, indexStr) => {
    const index = Number(indexStr);
    if (String(index) === indexStr && index >= 0 && index < saved.length) {
      const entry = saved[index];
      return typeof entry === 'string' ? entry : entry[1];
    }
    return match;
  });
}
