/**
 * receipt-persistence-manager.mjs
 *
 * Persists context receipts and redacts JSONL event evidence for Phase 08.
 */

import fs from 'node:fs';
import path from 'node:path';
import { redactRecord, createRedactionContext } from './redact-vscode-local-evidence.mjs';
import { REPORTS_ROOT, REPO_ROOT } from './candidate-identity-provider.mjs';

/**
 * Normalizes dynamic temporary directory paths to avoid git diff churn.
 */
export function sanitizeTmpPath(p) {
  if (typeof p !== 'string') return p;
  return p.replace(/\/tmp\/evcrate-p08-[^/]+/g, '<fixture-root>');
}

/**
 * Saves markdown receipt and redacted event logs for a given context directory.
 * Removes stale event files when a receipt has no events.
 */
export function saveReceipt(contextName, receiptContent, rawEvents = []) {
  const contextDir = path.join(REPORTS_ROOT, contextName);
  fs.mkdirSync(contextDir, { recursive: true });
  fs.writeFileSync(path.join(contextDir, 'receipt.md'), receiptContent, 'utf8');

  const eventsFile = path.join(contextDir, 'events-redacted.jsonl');
  if (rawEvents.length > 0) {
    const redCtx = createRedactionContext({ projectRoot: REPO_ROOT });
    const redactedEvents = rawEvents.map(evt => redactRecord(evt, redCtx));
    const lines = redactedEvents.map(evt => JSON.stringify(evt));
    fs.writeFileSync(eventsFile, lines.join('\n') + '\n', 'utf8');
  } else if (fs.existsSync(eventsFile)) {
    fs.unlinkSync(eventsFile);
  }
}
