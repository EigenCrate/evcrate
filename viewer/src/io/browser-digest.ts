import { validateCheckpointV2, type CheckpointV2 } from '../../../src/protocol/advisor-contract-runtime.js';

const encoder = new TextEncoder();

export async function computeBrowserSha256(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === 'string' ? encoder.encode(data) : data;
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('Web Crypto API (crypto.subtle) is unavailable');
  }
  const hashBuffer = await subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function computeBrowserCheckpointDigest(checkpoint: CheckpointV2 | unknown): Promise<string> {
  const validated = validateCheckpointV2(checkpoint);
  const canonical = JSON.stringify(validated);
  return computeBrowserSha256(canonical);
}
