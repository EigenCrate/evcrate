#!/usr/bin/env node
/**
 * scout-block.cjs - Cross-platform hook for blocking directory access
 *
 * Blocks access to directories listed in .omp/.evcrateignore
 * Uses gitignore-spec compliant pattern matching via 'ignore' package
 *
 * Blocking Rules:
 * - File paths: Blocks any file_path/path/pattern containing blocked directories
 * - Bash commands: Blocks directory access (cd, ls, cat, etc.) but ALLOWS build commands
 *   - Blocked: cd node_modules, ls packages/web/node_modules, cat dist/file.js
 *   - Allowed: npm build, go build, cargo build, make, mvn, gradle, docker build, kubectl, terraform
 *
 * Configuration:
 * - Edit .omp/.evcrateignore to customize blocked patterns (one per line, # for comments)
 * - Supports negation patterns (!) to allow specific paths
 *
 * Exit Codes:
 * - 0: Command allowed
 * - 2: Command blocked
 */

const fs = require('fs');
const path = require('path');

// Import modules
const { loadPatterns, createMatcher, matchPath } = require('./scout-block/pattern-matcher.cjs');
const {
  extractFromToolInput,
  extractFromCommand,
  splitCommandSegments,
  cleanCommandSegment,
  hasUnterminatedQuotes,
  hasCommandSubstitution,
  normalizeExtractedPath,
  isBlockedDirOperand
} = require('./scout-block/path-extractor.cjs');
const { formatBlockedError } = require('./scout-block/error-formatter.cjs');
const { detectBroadPatternIssue, formatBroadPatternError } = require('./scout-block/broad-pattern-detector.cjs');

// Build command allowlist - these are allowed even if they contain blocked paths
// Handles flags and filters: npm build, pnpm --filter web run build, yarn workspace app build
// Also allows: go, cargo, make, mvn/mvnw, gradle/gradlew, dotnet, docker, bazel, cmake, sbt, flutter, swift, ant, ninja, meson
const BUILD_COMMAND_PATTERN = /^(npm|pnpm|yarn|bun)\s+([^\s]+\s+)*(run\s+)?(build|test|lint|dev|start|install|ci|add|remove|update|publish|pack|init|create|exec)\b/;
const NODE_BUILD_SCRIPT_PATTERN = /^(node|bun)\s+([^\s]+\s+)*((\S*\/)?build\.(js|cjs|mjs|ts))\b/;
const PYTHON_BUILD_PATTERN = /^((\S*\/)?(python\d*(\.\d+)?|py))\s+(-m\s+build|setup\.py\s+build)\b/;
const DENO_BUILD_PATTERN = /^deno\s+task\s+build\b/;
const ZIG_BUILD_PATTERN = /^zig\s+build\b/;
const TOOL_COMMAND_PATTERN = /^(\.\/)?(npx|pnpx|bunx|tsc|esbuild|vite|webpack|rollup|turbo|nx|jest|vitest|mocha|eslint|prettier|go|cargo|make|mvn|mvnw|gradle|gradlew|dotnet|docker|podman|kubectl|helm|terraform|ansible|bazel|cmake|sbt|flutter|swift|ant|ninja|meson)\b/;
// Allow execution from .venv/bin/ or venv/bin/ (Unix) and .venv/Scripts/ or venv/Scripts/ (Windows)
// Blocks exploration (cat, ls, grep) but allows running venv executables
const VENV_EXECUTABLE_PATTERN = /(^|[\/\\])\.?venv[\/\\](bin|Scripts)[\/\\]/;

/**
 * Check if a command is a build/tooling command (should be allowed)
 *
 * @param {string} command - The command to check
 * @returns {boolean}
 */
function isBuildCommand(command) {
  if (!command || typeof command !== 'string') return false;
  if (hasUnterminatedQuotes(command) || hasCommandSubstitution(command)) {
    return false;
  }
  const cleaned = cleanCommandSegment(command);
  if (!cleaned) return false;
  return BUILD_COMMAND_PATTERN.test(cleaned) ||
         NODE_BUILD_SCRIPT_PATTERN.test(cleaned) ||
         PYTHON_BUILD_PATTERN.test(cleaned) ||
         DENO_BUILD_PATTERN.test(cleaned) ||
         ZIG_BUILD_PATTERN.test(cleaned) ||
         TOOL_COMMAND_PATTERN.test(cleaned);
}

/**
 * Check if command executes from a .venv bin directory
 * Allows: ~/.omp/agent/skills/.venv/bin/python3 script.py
 * Allows: .venv/Scripts/python.exe script.py
 *
 * @param {string} command - The command to check
 * @returns {boolean}
 */
function isVenvExecutable(command) {
  if (!command || typeof command !== 'string') return false;
  if (hasUnterminatedQuotes(command) || hasCommandSubstitution(command)) {
    return false;
  }
  const cleaned = cleanCommandSegment(command);
  if (!cleaned) return false;
  return VENV_EXECUTABLE_PATTERN.test(cleaned);
}

function runHook() {
  try {
    // Read stdin synchronously
    const hookInput = fs.readFileSync(0, 'utf-8');

    // Validate input not empty
    if (!hookInput || hookInput.trim().length === 0) {
      console.error('ERROR: Empty input');
      process.exit(2);
    }

    // Parse JSON
    let data;
    try {
      data = JSON.parse(hookInput);
    } catch (parseError) {
      // Fail-open for unparseable input
      console.error('WARN: JSON parse failed, allowing operation');
      process.exit(0);
    }

    // Validate structure
    if (!data.tool_input || typeof data.tool_input !== 'object') {
      // Fail-open for invalid structure
      console.error('WARN: Invalid JSON structure, allowing operation');
      process.exit(0);
    }

    const toolInput = data.tool_input;
    const toolName = data.tool_name || 'unknown';
    const cmd = toolInput.command || toolInput.CommandLine;
  // Check for overly broad glob patterns (Glob tool)
  // This prevents LLMs from filling context with **/*.ts at project root
  if (toolName === 'Glob' || toolInput.pattern) {
    const broadResult = detectBroadPatternIssue(toolInput);
    if (broadResult.blocked) {
      const errorMsg = formatBroadPatternError(broadResult, path.dirname(__dirname));
      console.error(errorMsg);
      process.exit(2);
    }
  }

  // Load patterns from the project ignore configuration.
  const scriptDir = __dirname;
  const claudeDir = path.dirname(scriptDir); // Go up from hooks/ to .omp/
  const evcrateIgnorePath = path.join(claudeDir, '.evcrateignore');
  const patterns = loadPatterns(evcrateIgnorePath);
  const matcher = createMatcher(patterns);

  // Extract paths from tool input
  let extractedPaths = [];

  if (cmd && typeof cmd === 'string') {
    const segments = splitCommandSegments(cmd);
    for (const segment of segments) {
      // Build commands and venv executables bypass path checking
      if (isBuildCommand(segment) || isVenvExecutable(segment)) {
        continue;
      }
      // Non-build segments: extract paths to verify against blocked patterns
      const segmentPaths = extractFromCommand(segment);
      extractedPaths.push(...segmentPaths);
    }

    // Direct path params if any
    const directParams = ['file_path', 'path', 'pattern', 'AbsolutePath', 'SearchPath', 'DirectoryPath', 'TargetFile'];
    for (const param of directParams) {
      if (toolInput[param] && typeof toolInput[param] === 'string') {
        const normalized = normalizeExtractedPath(toolInput[param]);
        if (normalized) {
          if (isBlockedDirOperand(normalized) && !normalized.endsWith('/') && !normalized.includes('*')) {
            extractedPaths.push(normalized + '/');
          }
          extractedPaths.push(normalized);
        }
      }
    }
  } else {
    extractedPaths = extractFromToolInput(toolInput, toolName);
  }
  // If no paths extracted, allow operation
  if (extractedPaths.length === 0) {
    process.exit(0);
  }

  // Check each path against patterns
  for (const extractedPath of extractedPaths) {
    const result = matchPath(matcher, extractedPath);
    if (result.blocked) {
      // Output rich error message
      const errorMsg = formatBlockedError({
        path: extractedPath,
        pattern: result.pattern,
        tool: toolName,
        claudeDir: claudeDir
      });
      console.error(errorMsg);
      process.exit(2);
    }
  }

  // All paths allowed
  process.exit(0);
  } catch (error) {
    // Fail-open for unexpected errors
    console.error('WARN: Hook error, allowing operation -', error.message);
    process.exit(0);
  }
}

if (require.main === module) {
  runHook();
}

module.exports = {
  isBuildCommand,
  isVenvExecutable,
  BUILD_COMMAND_PATTERN,
  NODE_BUILD_SCRIPT_PATTERN,
  PYTHON_BUILD_PATTERN,
  DENO_BUILD_PATTERN,
  ZIG_BUILD_PATTERN,
  TOOL_COMMAND_PATTERN,
  VENV_EXECUTABLE_PATTERN
};
