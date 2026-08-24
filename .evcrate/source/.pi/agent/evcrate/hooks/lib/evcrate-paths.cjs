#!/usr/bin/env node
'use strict';

/**
 * EVCrate Paths - Centralized path constants for all temporary/runtime files
 *
 * All EVCrate temporary/runtime state lives under the
 * ${TMPDIR:-/tmp}/evcrate/ namespace:
 * - markers, calibration, and debug logs use its direct children
 * - advisory state uses ${TMPDIR:-/tmp}/evcrate/advice/v1/
 *
 * Fixes:
 * - #177: Race condition from shared global state file
 * - #178: Scattered temp files consolidation
 *
 * @module evcrate-paths
 */

const path = require('path');
const os = require('os');
const fs = require('fs');

// Root directory for all EVCrate temporary/runtime files.
const EVCRATE_TMP_DIR = path.join(os.tmpdir(), 'evcrate');

// Session-specific marker files (per-session, no race conditions)
const MARKERS_DIR = path.join(EVCRATE_TMP_DIR, 'markers');

// Global calibration data (shared by design - records compact thresholds)
const CALIBRATION_PATH = path.join(EVCRATE_TMP_DIR, 'calibration.json');

// Debug logs directory
const DEBUG_DIR = path.join(EVCRATE_TMP_DIR, 'debug');

// Advisory state has its own subtree under the EVCrate runtime namespace.
const EVCRATE_ADVICE_ROOT = EVCRATE_TMP_DIR;
const ADVICE_DIR = path.join(EVCRATE_ADVICE_ROOT, 'advice');

/**
 * Ensure directory exists
 * @param {string} dirPath - Directory path to create
 */
function ensureDir(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  } catch (err) {
    // Silent fail - non-critical, but log for debugging
    if (process.env.EVCRATE_DEBUG) {
      console.error(`[EVCrate] Failed to create ${dirPath}: ${err.message}`);
    }
  }
}

/**
 * Get marker file path for a session
 * @param {string} sessionId - Session ID
 * @returns {string} Full path to marker file
 */
function getMarkerPath(sessionId) {
  return path.join(MARKERS_DIR, `${sessionId}.json`);
}

/**
 * Get debug log path for a session
 * @param {string} sessionId - Session ID
 * @returns {string} Full path to debug log
 */
function getDebugLogPath(sessionId) {
  return path.join(DEBUG_DIR, `${sessionId}.log`);
}

/**
 * Initialize EVCrate temp directories
 * Call this at startup to ensure directories exist
 */
function initDirs() {
  ensureDir(EVCRATE_TMP_DIR);
  ensureDir(MARKERS_DIR);
  ensureDir(DEBUG_DIR);
}

/**
 * Clean up all EVCrate temp files
 * Useful for testing or manual cleanup
 */
function cleanAll() {
  try {
    if (fs.existsSync(EVCRATE_TMP_DIR)) {
      fs.rmSync(EVCRATE_TMP_DIR, { recursive: true, force: true });
    }
  } catch (err) {
    // Silent fail
  }
}

module.exports = {
  // Directories
  EVCRATE_TMP_DIR,
  EVCRATE_ADVICE_ROOT,
  MARKERS_DIR,
  DEBUG_DIR,
  ADVICE_DIR,

  // Files
  CALIBRATION_PATH,

  // Helpers
  ensureDir,
  getMarkerPath,
  getDebugLogPath,
  initDirs,
  cleanAll
};
