#!/usr/bin/env node
/**
 * pattern-matcher.cjs - Gitignore-spec compliant pattern matching
 *
 * Uses 'ignore' package for .evcrateignore parsing and path matching.
 * Supports negation patterns (!) for allowlisting.
 */

const Ignore = require('./vendor/ignore');
const fs = require('fs');
const path = require('path');

// Default patterns if .evcrateignore doesn't exist or is empty
// Only includes directories with HEAVY file counts (1000+ files typical)
const DEFAULT_PATTERNS = [
  // JavaScript/TypeScript - package dependencies & build outputs
  'node_modules/',
  'dist/',
  'build/',
  '.next/',
  '.nuxt/',
  // Python - virtualenvs & cache
  '__pycache__/',
  '.venv/',
  'venv/',
  // Go/PHP - vendor dependencies
  'vendor/',
  // Rust/Java - compiled outputs
  'target/',
  // Version control
  '.git/',
  // Test coverage (can be large with reports)
  'coverage/',
];

/**
 * Load patterns from .evcrateignore file
 * Falls back to DEFAULT_PATTERNS if file doesn't exist or is empty
 *
 * @param {string} evcrateIgnorePath - Path to .evcrateignore file
 * @returns {string[]} Array of patterns
 */
function loadPatterns(evcrateIgnorePath) {
  if (!evcrateIgnorePath || !fs.existsSync(evcrateIgnorePath)) {
    return DEFAULT_PATTERNS;
  }

  try {
    const content = fs.readFileSync(evcrateIgnorePath, 'utf-8');
    const patterns = content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));

    return patterns.length > 0 ? patterns : DEFAULT_PATTERNS;
  } catch (error) {
    console.error('WARN: Failed to read .evcrateignore:', error.message);
    return DEFAULT_PATTERNS;
  }
}

/**
 * Normalize a pattern into one or more gitignore rules.
 *
 * Categories:
 * - Directory patterns (ending with /): preserve gitignore directory-only semantics.
 * - Glob / path patterns (containing * or internal /): preserve authored gitignore semantics.
 * - Legacy bare patterns (no slash, no wildcard): expand to match at root and any depth.
 * - Negation patterns (! prefix): preserve same category rules with ! prefix.
 *
 * @param {string} pattern - Pattern from .evcrateignore
 * @returns {string[]} Normalized pattern rules
 */
function normalizePattern(pattern) {
  if (!pattern || typeof pattern !== 'string') return [];
  const trimmed = pattern.trim();
  if (!trimmed || trimmed.startsWith('#')) return [];

  const isNegated = trimmed.startsWith('!');
  const raw = isNegated ? trimmed.slice(1) : trimmed;
  const prefix = isNegated ? '!' : '';

  // Directory pattern (ends with /)
  if (raw.endsWith('/')) {
    return [trimmed];
  }

  // Glob or explicit path (contains / or *)
  if (raw.includes('/') || raw.includes('*')) {
    return [trimmed];
  }

  // Legacy bare pattern (no slash, no wildcard): match anywhere
  if (isNegated) {
    return [
      `!**/${raw}`,
      `!**/${raw}/**`
    ];
  }

  return [
    `**/${raw}`,
    `**/${raw}/**`,
    raw,
    `${raw}/**`
  ];
}

/**
 * Create a matcher from patterns
 * Normalizes patterns to match anywhere in the path tree
 *
 * @param {string[]} patterns - Array of patterns from .evcrateignore
 * @returns {Object} Matcher object with ig instance and pattern info
 */
function createMatcher(patterns) {
  const ig = Ignore();
  const normalizedPatterns = [];

  for (const p of patterns) {
    const rules = normalizePattern(p);
    normalizedPatterns.push(...rules);
  }

  ig.add(normalizedPatterns);

  return {
    ig,
    patterns: normalizedPatterns,
    original: patterns
  };
}

/**
 * Check if a path should be blocked
 *
 * @param {Object} matcher - Matcher object from createMatcher
 * @param {string} testPath - Path to test
 * @returns {Object} { blocked: boolean, pattern?: string }
 */
function matchPath(matcher, testPath) {
  if (!testPath || typeof testPath !== 'string') {
    return { blocked: false };
  }

  // Normalize path separators (Windows backslash to forward slash)
  let normalized = testPath.replace(/\\/g, '/');

  // Remove leading ./ if present
  if (normalized.startsWith('./')) {
    normalized = normalized.slice(2);
  }

  // Check if path is ignored (blocked)
  const blocked = matcher.ig.ignores(normalized);

  if (blocked) {
    // Find which original pattern matched for error message
    const matchedPattern = findMatchingPattern(matcher.original, normalized);
    return { blocked: true, pattern: matchedPattern };
  }

  return { blocked: false };
}

/**
 * Find which original pattern matched (for error messages)
 *
 * @param {string[]} originalPatterns - Original patterns from .evcrateignore
 * @param {string} path - The path that was blocked
 * @returns {string} The pattern that matched
 */
function findMatchingPattern(originalPatterns, path) {
  for (const p of originalPatterns) {
    if (p.startsWith('!')) continue; // Skip negations

    const tempIg = Ignore();
    tempIg.add(normalizePattern(p));

    if (tempIg.ignores(path)) {
      return p;
    }
  }

  return originalPatterns.find(p => !p.startsWith('!')) || 'unknown';
}

module.exports = {
  loadPatterns,
  normalizePattern,
  createMatcher,
  matchPath,
  findMatchingPattern,
  DEFAULT_PATTERNS
};
