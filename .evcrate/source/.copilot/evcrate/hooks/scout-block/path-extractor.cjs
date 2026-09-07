#!/usr/bin/env node
/**
 * path-extractor.cjs - Extract paths from GitHub Copilot CLI tool inputs
 *
 * Extracts file_path, path, pattern params and parses Bash commands
 * to find all path-like arguments.
 */

/**
 * Extract all paths from a tool_input object
 * Handles: file_path, path, pattern params and command strings
 *
 * @param {Object} toolInput - The tool_input from hook JSON
 * @returns {string[]} Array of extracted paths
 */
function extractFromToolInput(toolInput, toolName) {
  const paths = [];

  if (!toolInput || typeof toolInput !== 'object') {
    return paths;
  }

  // Direct path params (Read, Edit, Write, Grep, Glob tools)
  const directParams = ['file_path', 'path', 'pattern', 'AbsolutePath', 'SearchPath', 'DirectoryPath', 'TargetFile'];
  for (const param of directParams) {
    if (toolInput[param] && typeof toolInput[param] === 'string') {
      const normalized = normalizeExtractedPath(toolInput[param]);
      if (normalized) {
        if (isBlockedDirOperand(normalized) && !normalized.endsWith('/') && !normalized.includes('*')) {
          paths.push(normalized + '/');
        }
        paths.push(normalized);
      }
    }
  }

  // Extract from Bash command if present (Copilot uses 'command', agy uses 'CommandLine')
  const cmd = toolInput.command || toolInput.CommandLine;
  if (cmd && typeof cmd === 'string') {
    const cmdPaths = extractFromCommand(cmd);
    paths.push(...cmdPaths);
  }

  return paths.filter(Boolean);
}

/**
 * Extract path-like segments from a Bash command string
 * Handles quoted paths and filters out non-path tokens
 *
 * @param {string} command - The command string
 * @returns {string[]} Array of extracted paths
 */
function extractFromCommand(command) {
  if (!command || typeof command !== 'string') {
    return [];
  }

  const cleaned = cleanCommandSegment(command);
  const paths = [];

  // Remove quoted strings for unquoted path extraction
  const withoutQuotes = cleaned.replace(/["'][^"']*["']/g, ' ');

  // Split on whitespace and extract path-like tokens
  const tokens = withoutQuotes.split(/\s+/).filter(Boolean);
  const rawCmd = tokens[0] || '';
  const baseCommand = rawCmd.replace(/^.*[/\\]/, '').toLowerCase();

  // First, extract quoted strings (preserve spaces in paths)
  const quotedPattern = /["']([^"']+)["']/g;
  let match;
  while ((match = quotedPattern.exec(cleaned)) !== null) {
    if (looksLikePath(match[1])) {
      const norm = normalizeExtractedPath(match[1]);
      if (EXPLORATION_COMMANDS.has(baseCommand) && isBlockedDirOperand(norm) && !norm.endsWith('/')) {
        paths.push(norm + '/');
      }
      paths.push(norm);
    }
  }
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const prevToken = i > 0 ? tokens[i - 1] : '';

    // Skip flags and shell operators
    if (isSkippableToken(token)) continue;

    // Subcommand and runner syntax check: do not treat subcommands/module names as paths
    if (isBuildSubcommandSyntax(baseCommand, token, prevToken)) continue;

    // Priority check: if token IS a blocked directory name exactly
    if (isBlockedDirName(token)) {
      if (EXPLORATION_COMMANDS.has(baseCommand)) {
        paths.push(normalizeExtractedPath(token + '/'));
      } else {
        paths.push(normalizeExtractedPath(token));
      }
      continue;
    }

    // Check if token is a path ending in a blocked directory under exploration commands
    if (EXPLORATION_COMMANDS.has(baseCommand) && isBlockedDirOperand(token)) {
      paths.push(normalizeExtractedPath(token + '/'));
      continue;
    }

    // Skip common non-path command words
    if (isCommandKeyword(token)) continue;

    // Check if it looks like a path
    if (looksLikePath(token)) {
      paths.push(normalizeExtractedPath(token));
    }
  }

  return paths;
}

// Common blocked directory names that should be extracted even if they
// match command keywords (e.g., "build" is both a subcommand and a dir name)
// Keep in sync with DEFAULT_PATTERNS in pattern-matcher.cjs
const BLOCKED_DIR_NAMES = [
  'node_modules', '__pycache__', '.git', 'dist', 'build',
  '.next', '.nuxt', '.venv', 'venv', 'vendor', 'target', 'coverage'
];

// Commands whose operands target directories or files for reading/traversal/manipulation
const EXPLORATION_COMMANDS = new Set([
  'cd', 'ls', 'dir', 'tree', 'find', 'cat', 'head', 'tail', 'less', 'more',
  'du', 'grep', 'rg', 'touch', 'rm', 'rmdir', 'cp', 'mv', 'stat', 'chmod',
  'chown', 'pushd', 'open'
]);

/**
 * Check if a token in a build runner invocation is syntax rather than a path operand
 *
 * @param {string} baseCommand - Base executable name
 * @param {string} token - Current token
 * @param {string} prevToken - Preceding token
 * @returns {boolean}
 */
function isBuildSubcommandSyntax(baseCommand, token, prevToken) {
  if (token !== 'build') return false;

  // python[version] -m build, python[version] setup.py build
  if (baseCommand === 'python' || /^python\d*(\.\d+)?$/.test(baseCommand) || baseCommand === 'py') {
    return prevToken === '-m' || prevToken === 'setup.py';
  }

  // zig build
  if (baseCommand === 'zig') return true;

  // deno task build
  if (baseCommand === 'deno') return prevToken === 'task';

  // dotnet build
  if (baseCommand === 'dotnet') return true;

  // swift build
  if (baseCommand === 'swift') return true;

  return false;
}

/**
 * Check if token is exactly a blocked directory name
 * This takes priority over command keyword filtering
 *
 * @param {string} token - Token to check
 * @returns {boolean}
 */
function isBlockedDirName(token) {
  if (!token || typeof token !== 'string') return false;
  const cleaned = token.replace(/^[./\\]+/, '').replace(/[./\\]+$/, '').toLowerCase();
  return BLOCKED_DIR_NAMES.includes(cleaned);
}

/**
 * Check if a token is a path ending in a blocked directory name.
 * e.g., "packages/web/node_modules", "apps/api/dist"
 *
 * @param {string} token - Token to check
 * @returns {boolean}
 */
function isBlockedDirOperand(token) {
  if (!token || typeof token !== 'string') return false;
  const normalized = token.replace(/\\/g, '/').replace(/\/+$/, '');
  const segments = normalized.split('/');
  const lastSegment = segments[segments.length - 1];
  return lastSegment ? isBlockedDirName(lastSegment) : false;
}

/**
 * Check if a string looks like a file path
 *
 * @param {string} str - String to check
 * @returns {boolean}
 */
function looksLikePath(str) {
  if (!str || str.length < 2) return false;

  // Contains path separator
  if (str.includes('/') || str.includes('\\')) return true;

  // Starts with relative path indicator
  if (str.startsWith('./') || str.startsWith('../')) return true;

  // Has file extension (likely a file)
  if (/\.\w{1,6}$/.test(str)) return true;

  // Contains common blocked directory names
  if (/node_modules|__pycache__|\.git|dist|build/.test(str)) return true;

  // Looks like a directory path
  if (/^[a-zA-Z0-9_-]+\//.test(str)) return true;

  return false;
}

/**
 * Check if token should be skipped (flags, operators)
 *
 * @param {string} token - Token to check
 * @returns {boolean}
 */
function isSkippableToken(token) {
  // Flags
  if (token.startsWith('-')) return true;

  // Shell operators
  if (['|', '||', '&&', '>', '>>', '<', '<<', '&', ';'].includes(token)) return true;
  if (token.startsWith('|') || token.startsWith('>') || token.startsWith('<')) return true;
  if (token.startsWith('&')) return true;

  // Numeric values
  if (/^\d+$/.test(token)) return true;

  return false;
}

/**
 * Check if token is a common command keyword (not a path)
 *
 * @param {string} token - Token to check
 * @returns {boolean}
 */
function isCommandKeyword(token) {
  const keywords = [
    // Shell commands
    'echo', 'cat', 'ls', 'cd', 'rm', 'cp', 'mv', 'find', 'grep', 'head', 'tail',
    'wc', 'du', 'tree', 'touch', 'mkdir', 'rmdir', 'pwd', 'which', 'env', 'export',
    'source', 'bash', 'sh', 'zsh', 'true', 'false', 'test', 'xargs', 'tee', 'sort',
    'uniq', 'cut', 'tr', 'sed', 'awk', 'diff', 'chmod', 'chown', 'ln', 'file',

    // Package managers and their subcommands
    'npm', 'pnpm', 'yarn', 'bun', 'npx', 'pnpx', 'bunx', 'node',
    'run', 'build', 'test', 'lint', 'dev', 'start', 'install', 'ci', 'exec',
    'add', 'remove', 'update', 'publish', 'pack', 'init', 'create',

    // Build tools
    'tsc', 'esbuild', 'vite', 'webpack', 'rollup', 'turbo', 'nx',
    'jest', 'vitest', 'mocha', 'eslint', 'prettier',

    // Git
    'git', 'commit', 'push', 'pull', 'merge', 'rebase', 'checkout', 'branch',
    'status', 'log', 'diff', 'add', 'reset', 'stash', 'fetch', 'clone',

    // Docker
    'docker', 'compose', 'up', 'down', 'ps', 'logs', 'exec', 'container', 'image',

    // Misc
    'sudo', 'time', 'timeout', 'watch', 'make', 'cargo', 'python', 'python3', 'pip',
    'ruby', 'gem', 'go', 'rust', 'java', 'javac', 'mvn', 'gradle'
  ];

  return keywords.includes(token.toLowerCase());
}

/**
 * Normalize an extracted path
 * - Remove surrounding quotes
 * - Normalize path separators to forward slash
 *
 * @param {string} path - Path to normalize
 * @returns {string} Normalized path
 */
function normalizeExtractedPath(path) {
  if (!path) return '';

  let normalized = path.trim();

  // Remove surrounding quotes
  if ((normalized.startsWith('"') && normalized.endsWith('"')) ||
      (normalized.startsWith("'") && normalized.endsWith("'"))) {
    normalized = normalized.slice(1, -1);
  }

  // Normalize path separators to forward slash
  normalized = normalized.replace(/\\/g, '/');

  // Collapse multiple forward slashes, preserving single trailing slash if present
  normalized = normalized.replace(/\/+/g, '/');

  return normalized;
}

/**
 * Split a shell command string into individual command segments by operators
 * (&&, ||, ;, \n, |, &) while respecting quotes and escapes.
 *
 * @param {string} cmd - The command string to split
 * @returns {string[]} Array of command segments
 */
function splitCommandSegments(cmd) {
  if (!cmd || typeof cmd !== 'string') return [];
  const segments = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escape = false;

  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];
    const prev = i > 0 ? cmd[i - 1] : '';
    const next = i < cmd.length - 1 ? cmd[i + 1] : '';

    if (escape) {
      current += ch;
      escape = false;
      continue;
    }

    if (ch === '\\' && !inSingleQuote) {
      current += ch;
      escape = true;
      continue;
    }

    if (ch === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      current += ch;
      continue;
    }

    if (ch === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      current += ch;
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote) {
      // Check for && or ||
      if ((ch === '&' && next === '&') || (ch === '|' && next === '|')) {
        if (current.trim()) segments.push(current.trim());
        current = '';
        i++; // skip second char
        continue;
      }
      // Check for ; or \n
      if (ch === ';' || ch === '\n') {
        if (current.trim()) segments.push(current.trim());
        current = '';
        continue;
      }
      // Check for | (pipeline)
      if (ch === '|') {
        if (current.trim()) segments.push(current.trim());
        current = '';
        continue;
      }
      // Check for & (background separator, not redirection like 2>&1, >&, <&)
      if (ch === '&') {
        const isRedirection = prev === '>' || prev === '<' || /^\d/.test(next);
        if (!isRedirection) {
          if (current.trim()) segments.push(current.trim());
          current = '';
          continue;
        }
      }
    }

    current += ch;
  }

  if (current.trim()) {
    segments.push(current.trim());
  }


  return segments;
}

/**
 * Check if a command string has unterminated quotes or escape
 *
 * @param {string} str - String to check
 * @returns {boolean}
 */
function hasUnterminatedQuotes(str) {
  if (!str || typeof str !== 'string') return false;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escape = false;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\' && !inSingleQuote) {
      escape = true;
      continue;
    }
    if (ch === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }
    if (ch === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }
  }
  return inSingleQuote || inDoubleQuote || escape;
}

/**
 * Check if a command string contains command substitutions
 * (backticks or $(...) construct)
 *
 * @param {string} str - String to check
 * @returns {boolean}
 */
function hasCommandSubstitution(str) {
  if (!str || typeof str !== 'string') return false;
  // Check for backticks, $(...), <(...), and >(...) constructs
  return /`|\$\(|\<\(|\>\(/.test(str);
}

/**
 * Clean a command segment by removing leading subshell wrappers and environment variables.
 * E.g., "(cd foo" -> "cd foo", "NODE_ENV=production npm run build" -> "npm run build"
 *
 * @param {string} segment - The command segment to clean
 * @returns {string} Cleaned command segment
 */
function cleanCommandSegment(segment) {
  if (!segment || typeof segment !== 'string') return '';
  let s = segment.trim();
  // Strip leading subshell / grouping characters
  while (s.startsWith('(') || s.startsWith('{')) {
    s = s.slice(1).trim();
  }
  while (s.endsWith(')') || s.endsWith('}')) {
    s = s.slice(0, -1).trim();
  }

  // Strip environment variable assignments at the beginning (e.g. VAR=val, FOO="bar baz", KEY=)
  const envVarRegex = /^[A-Za-z_][A-Za-z0-9_]*=(?:'[^']*'|"(?:[^"\\]|\\.)*"|(?:\\.|[^\s"';&|()<>])*)\s*/;
  while (envVarRegex.test(s)) {
    const match = s.match(envVarRegex);
    if (!match || match[0].length === 0) break;
    s = s.slice(match[0].length).trim();
  }

  return s;
}

module.exports = {
  extractFromToolInput,
  extractFromCommand,
  splitCommandSegments,
  cleanCommandSegment,
  looksLikePath,
  isSkippableToken,
  isCommandKeyword,
  isBlockedDirName,
  isBlockedDirOperand,
  isBuildSubcommandSyntax,
  hasUnterminatedQuotes,
  hasCommandSubstitution,
  normalizeExtractedPath,
  BLOCKED_DIR_NAMES,
  EXPLORATION_COMMANDS
};
