import { existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type {
  VscodeAdvisorExecutableResult,
  VscodeEvidenceValidationResult,
  VscodeConsoleValidationResult,
  VscodeCheckpointEnvelopeOptions,
  VscodeStateEnvelopeOptions,
  VscodeEvidenceFile
} from './advisory-types.js';
import { ADVICE_CALLER_UNAVAILABLE_VSCODE } from './advisory-types.js';

export function resolveVscodeAdvisorExecutable(customHome?: string): VscodeAdvisorExecutableResult {
  const home = customHome ?? process.env.HOME ?? homedir();
  if (!home) {
    return Object.freeze({
      executablePath: '',
      available: false,
      reason: ADVICE_CALLER_UNAVAILABLE_VSCODE
    });
  }

  const executablePath = join(home, '.evcrate', 'bin', 'evcrate-advisor');
  if (!existsSync(executablePath)) {
    return Object.freeze({
      executablePath,
      available: false,
      reason: ADVICE_CALLER_UNAVAILABLE_VSCODE
    });
  }

  try {
    const stat = statSync(executablePath);
    if (!stat.isFile()) {
      return Object.freeze({
        executablePath,
        available: false,
        reason: ADVICE_CALLER_UNAVAILABLE_VSCODE
      });
    }
  } catch {
    return Object.freeze({
      executablePath,
      available: false,
      reason: ADVICE_CALLER_UNAVAILABLE_VSCODE
    });
  }

  return Object.freeze({
    executablePath,
    available: true
  });
}

export function validateAdvisorEvidence(evidence: unknown): VscodeEvidenceValidationResult {
  const errors: string[] = [];

  if (!evidence || typeof evidence !== 'object') {
    return Object.freeze({
      valid: false,
      errors: Object.freeze(['Evidence must be a non-null object'])
    });
  }

  const ev = evidence as {
    readonly files?: readonly unknown[];
    readonly summary?: unknown;
    readonly validation_results?: readonly unknown[];
  };

  if (typeof ev.summary !== 'string' || !ev.summary.trim()) {
    errors.push('Evidence summary must be a non-empty string');
  }

  if (ev.files !== undefined) {
    if (!Array.isArray(ev.files)) {
      errors.push('evidence.files must be an array');
    } else {
      if (ev.files.length > 4) {
        errors.push(`evidence.files exceeds maximum 4 file objects (got ${ev.files.length})`);
      }

      let totalExcerptBytes = 0;
      for (let i = 0; i < ev.files.length; i++) {
        const file = ev.files[i] as VscodeEvidenceFile;
        if (!file || typeof file !== 'object') {
          errors.push(`evidence.files[${i}] must be an object`);
          continue;
        }

        if (typeof file.path !== 'string' || !file.path.trim()) {
          errors.push(`evidence.files[${i}].path must be a non-empty string`);
        } else if (file.path.startsWith('/') || file.path.includes('..')) {
          errors.push(`evidence.files[${i}].path must be a safe repository-relative path`);
        }

        if (typeof file.excerpt !== 'string' || !file.excerpt) {
          errors.push(`evidence.files[${i}].excerpt must be non-empty text`);
        } else {
          totalExcerptBytes += Buffer.byteLength(file.excerpt, 'utf8');
        }

        if (typeof file.digest !== 'string' || !/^[0-9a-f]{64}$/u.test(file.digest)) {
          errors.push(`evidence.files[${i}].digest must be a 64-char lowercase sha256 hex digest`);
        }
      }

      if (totalExcerptBytes > 16384) {
        errors.push(`Total evidence excerpt size exceeds 16 KiB limit (${totalExcerptBytes} bytes)`);
      }
    }
  }

  // Check for raw secrets or stack traces in serialized evidence
  const serialized = JSON.stringify(evidence);
  if (/\b(?:sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{20,}|BEGIN PRIVATE KEY)\b/u.test(serialized)) {
    errors.push('Evidence must not contain credentials or private keys');
  }

  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(errors)
  });
}

export function validateAdvisorConsole(): VscodeConsoleValidationResult {
  const isTTY = Boolean(process.stdin && process.stdin.isTTY);
  if (!isTTY) {
    return Object.freeze({
      isInteractive: false,
      channel: 'none',
      requiresHuman: true
    });
  }

  const isWindows = process.platform === 'win32';
  return Object.freeze({
    isInteractive: true,
    channel: isWindows ? 'console' : 'tty',
    requiresHuman: false
  });
}

export function buildAdvisorCheckpointEnvelope(
  options: VscodeCheckpointEnvelopeOptions
): Record<string, unknown> {
  return {
    protocol: 'evcrate-advisor-checkpoint',
    version: 2,
    task_run_id: options.task_run_id,
    checkpoint_id: options.checkpoint_id,
    phase_id: options.phase_id,
    task_revision: options.task_revision,
    evidence_revision: options.evidence_revision,
    checkpoint: options.checkpoint,
    kind: options.kind,
    question: options.question,
    task: options.task,
    proposal: options.proposal,
    evidence: options.evidence,
    prior: options.prior ?? {
      prior_consultation_id: null,
      prior_counsel: null,
      prior_disposition: null,
      observed_outcome: null
    }
  };
}

export function buildAdvisorStateEnvelope(
  op: string,
  options: VscodeStateEnvelopeOptions
): Record<string, unknown> {
  return {
    protocol: 'evcrate-advisor-state',
    version: 1,
    operation: op,
    task_run_id: options.task_run_id,
    operation_id: options.operation_id ?? null,
    expected_revision: options.expected_revision ?? null,
    payload: options.payload ?? {}
  };
}
