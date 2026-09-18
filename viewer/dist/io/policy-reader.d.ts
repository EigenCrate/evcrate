import type { FileSystemFileHandle } from './file-system-access.d.ts';
import { type AdvisorPolicyV1, type AdvisorPolicyV2 } from '../../../src/protocol/advisor-contract-runtime.js';
export type PolicyReaderStatus = 'POLICY_READY' | 'POLICY_MIGRATION_REQUIRED' | 'POLICY_SELECTION_CANCELLED' | 'POLICY_PERMISSION_DENIED' | 'POLICY_OVERSIZED' | 'POLICY_INVALID_JSON' | 'POLICY_UNSUPPORTED_VERSION' | 'POLICY_INVALID' | 'POLICY_READ_FAILED';
export interface PolicyReaderResult {
    readonly status: PolicyReaderStatus;
    readonly policy?: AdvisorPolicyV2 | AdvisorPolicyV1;
    readonly legacy?: boolean;
    readonly migrationRequired?: boolean;
    readonly fileName?: string;
    readonly bytes?: number;
}
export declare function selectAndReadPolicyFile(): Promise<PolicyReaderResult>;
export declare function readPolicyFileHandle(handle: FileSystemFileHandle): Promise<PolicyReaderResult>;
