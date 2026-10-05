import { availableParallelism, cpus } from 'node:os';
import { ControlPlaneError } from '../errors/control-plane-error.js';

export const MIN_BUILD_JOBS = 1;
export const MAX_BUILD_JOBS = 8;
export const DEFAULT_MAX_PARALLEL_JOBS = 2;

export interface ResolveJobsOptions {
  readonly explicitJobs?: number | string | undefined;
  readonly targetCount: number;
}

export function parseJobsValue(raw: unknown): number {
  if (typeof raw === 'number') {
    if (!Number.isInteger(raw) || raw < MIN_BUILD_JOBS || raw > MAX_BUILD_JOBS) {
      throw new ControlPlaneError(
        'USAGE_INVALID',
        `Jobs count must be an integer between ${MIN_BUILD_JOBS} and ${MAX_BUILD_JOBS}, got ${raw}`
      );
    }
    return raw;
  }
  if (typeof raw === 'string') {
    if (!/^[1-8]$/.test(raw)) {
      throw new ControlPlaneError(
        'USAGE_INVALID',
        `Jobs count must be an integer between ${MIN_BUILD_JOBS} and ${MAX_BUILD_JOBS}, got ${raw}`
      );
    }
    const parsed = Number.parseInt(raw, 10);
    return parsed;
  }
  throw new ControlPlaneError(
    'USAGE_INVALID',
    `Jobs count must be a number or numeric string between ${MIN_BUILD_JOBS} and ${MAX_BUILD_JOBS}`
  );
}

export function resolveBuildJobs(options: ResolveJobsOptions): number {
  const targetCount = Math.max(1, options.targetCount);
  let requestedJobs: number | undefined;

  if (options.explicitJobs !== undefined) {
    requestedJobs = parseJobsValue(options.explicitJobs);
  } else if (process.env.EVCRATE_BUILD_JOBS !== undefined && process.env.EVCRATE_BUILD_JOBS.trim() !== '') {
    requestedJobs = parseJobsValue(process.env.EVCRATE_BUILD_JOBS.trim());
  }

  if (requestedJobs !== undefined) {
    return Math.min(requestedJobs, targetCount);
  }

  // Bounded default: min(2, system parallelism, target count)
  let systemParallelism = 1;
  try {
    if (typeof availableParallelism === 'function') {
      const available = availableParallelism();
      if (typeof available === 'number' && available >= 1) systemParallelism = available;
    } else {
      const coreCount = cpus().length;
      if (typeof coreCount === 'number' && coreCount >= 1) systemParallelism = coreCount;
    }
  } catch {
    systemParallelism = 1;
  }

  return Math.max(1, Math.min(DEFAULT_MAX_PARALLEL_JOBS, systemParallelism, targetCount));
}
