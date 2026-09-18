import { type CheckpointV2 } from '../../../src/protocol/advisor-contract-runtime.js';
export declare function computeBrowserSha256(data: string | Uint8Array): Promise<string>;
export declare function computeBrowserCheckpointDigest(checkpoint: CheckpointV2 | unknown): Promise<string>;
