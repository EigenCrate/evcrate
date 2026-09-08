'use strict';

const { runController, parseInput } = require('./controller.cjs');
const { claimCheckpoint, attachControllerResult } = require('./task-state.cjs');
const { checkpointDigest } = require('./checkpoint-contract.cjs');
const { buildFailureEnvelope } = require('./controller-envelope.cjs');
const { createRoutingError, isRoutingError } = require('./errors.cjs');

// Only the default controller entrypoint invokes inference. State operations
// reserve/record but never launch, including when a prior controller died.
async function runManagedCheckpoint(input, dependencies = {}) {
  let checkpoint;
  let claim;
  let envelope;
  try {
    checkpoint = parseInput(input);
    if (checkpoint.version !== 2) return runController(input, dependencies);
    if (dependencies.signal?.aborted) throw createRoutingError('CANCELLED');
    claim = claimCheckpoint(checkpoint, dependencies);
    envelope = await runController(input, { ...dependencies, consultationId: claim.consultationId });
    // Required terminal linkage precedes stdout. A failed write must not publish
    // usable counsel or re-enter the inference controller.
    attachControllerResult(claim, envelope, dependencies);
    return envelope;
  } catch (error) {
    return buildFailureEnvelope({
      correlation_id: claim?.consultationId,
      checkpoint,
      checkpoint_digest: checkpoint?.version === 2 ? checkpointDigest(checkpoint) : null,
      receipt: envelope?.receipt || { elapsed_ms: 0 },
      attempts: envelope?.attempts || [],
      cleanup_outcome: envelope?.cleanup_outcome || 'not_needed',
      error: isRoutingError(error) ? error : createRoutingError('STATE_IO_FAILED')
    });
  }
}

module.exports = { runManagedCheckpoint };
