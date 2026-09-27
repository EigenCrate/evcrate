'use strict';

const fs = require('node:fs');
const tty = require('node:tty');
const readline = require('node:readline/promises');
const { randomUUID, randomBytes } = require('node:crypto');
const { createRoutingError, isRoutingError } = require('./errors.cjs');
const { observeConsoleWindows } = require('./windows-platform.cjs');
// This is a cooperative local interaction, not a sandbox against a same-user
// process controlling a terminal. Piped JSON alone never attests a human event.
async function observeTerminalDecision(request, signal) {
  if (signal?.aborted) throw createRoutingError('CANCELLED');
  const nonce = randomBytes(6).toString('hex');
  const challenge = `authorize ${request.task_run_id} ${request.expected_revision} ${nonce}`;
  const decision = JSON.stringify({
    task_run_id: request.task_run_id,
    expected_revision: request.expected_revision,
    decision: request.payload
  });

  if (process.platform === 'win32') {
    return observeConsoleWindows(decision, challenge, signal);
  }

  if (!process.stderr.isTTY) {
    throw createRoutingError('HUMAN_EVENT_REQUIRED');
  }
  let input;
  let output;
  let reader;
  let inputFd;
  let outputFd;
  try {
    inputFd = fs.openSync('/dev/tty', 'r');
    outputFd = fs.openSync('/dev/tty', 'w');
    if (!tty.isatty(inputFd) || !tty.isatty(outputFd)) throw createRoutingError('HUMAN_EVENT_REQUIRED');
    input = new tty.ReadStream(inputFd);
    inputFd = undefined;
    output = new tty.WriteStream(outputFd);
    outputFd = undefined;
    reader = readline.createInterface({ input, output, terminal: true });
    const answer = await reader.question(
      `\nHuman decision requested (local cooperative confirmation):\n${decision}\nType exactly: ${challenge}\n> `,
      { signal }
    );
    if (signal?.aborted) throw createRoutingError('CANCELLED');
    if (answer !== challenge) throw createRoutingError('HUMAN_EVENT_REQUIRED');
    return Object.freeze({ event_id: randomUUID(), source: 'local-terminal-confirmation' });
  } catch (error) {
    if (isRoutingError(error)) throw error;
    if (signal?.aborted || error?.name === 'AbortError') throw createRoutingError('CANCELLED');
    throw createRoutingError('HUMAN_EVENT_REQUIRED');
  } finally {
    reader?.close();
    input?.destroy();
    output?.destroy();
    if (inputFd !== undefined) fs.closeSync(inputFd);
    if (outputFd !== undefined) fs.closeSync(outputFd);
  }
}

module.exports = { observeTerminalDecision };
