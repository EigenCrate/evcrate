#!/usr/bin/env node
/**
 * SessionEnd Hook - Cleanup on session end
 *
 * Fires: When the Copilot session ends
 * Purpose: Delete compact marker files to reset context baseline on /clear
 *
 * Exit Codes:
 *   0 - Success (non-blocking)
 */

const fs = require('fs');
const { deleteMarker } = require('./lib/context-tracker.cjs');

async function main() {
  try {
    const stdin = fs.readFileSync(0, 'utf-8').trim();
    const data = stdin ? JSON.parse(stdin) : {};
    const reason = data.reason || 'unknown';
    const sessionId = data.session_id || null;

    // Remove state for every supported Copilot session-end reason.
    if (sessionId) {
      deleteMarker(sessionId);
    }

    process.exit(0);
  } catch (error) {
    process.exit(0);
  }
}

main();
