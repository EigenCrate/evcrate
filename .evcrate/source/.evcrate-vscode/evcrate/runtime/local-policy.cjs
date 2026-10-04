'use strict';

const DEFAULT_SCOUT_PATTERNS = [
  'node_modules/',
  'dist/',
  'build/',
  '.next/',
  '.nuxt/',
  '__pycache__/',
  '.venv/',
  'venv/',
  'vendor/',
  'target/',
  '.git/',
  'coverage/'
];

const SAFE_PATTERNS = [
  /\.example$/i,
  /\.sample$/i,
  /\.template$/i
];

const PRIVACY_PATTERNS = [
  /^\.env$/,
  /^\.env\./,
  /\.env$/,
  /\/\.env\./,
  /credentials/i,
  /secrets?\.ya?ml$/i,
  /\.pem$/,
  /\.key$/,
  /id_rsa/,
  /id_ed25519/
];

const BUILD_COMMAND_PATTERN = /^(npm|pnpm|yarn|bun)\s+([^\s]+\s+)*(run\s+)?(build|test|lint|dev|start|install|ci|add|remove|update|publish|pack|init|create|exec)\b/;
const TOOL_COMMAND_PATTERN = /^(\.\/)?(npx|pnpx|bunx|tsc|esbuild|vite|webpack|rollup|turbo|nx|jest|vitest|mocha|eslint|prettier|go|cargo|make|mvn|mvnw|gradle|gradlew|dotnet|docker|podman|kubectl|helm|terraform|ansible|bazel|cmake|sbt|flutter|swift|ant|ninja|meson)\b/;
const NODE_BUILD_SCRIPT_PATTERN = /^(node|bun)\s+([^\s]+\s+)*((\S*\/)?build\.(js|cjs|mjs|ts))\b/;
const PYTHON_BUILD_PATTERN = /^((\S*\/)?(python\d*(\.\d+)?|py))\s+(-m\s+build|setup\.py\s+build)\b/;
const DENO_BUILD_PATTERN = /^deno\s+task\s+build\b/;
const ZIG_BUILD_PATTERN = /^zig\s+build\b/;

const BROAD_PATTERN_REGEXES = [
  /^\*\*$/,
  /^\*$/,
  /^\*\*\/\*$/,
  /^\*\*\/\.\*$/,
  /^\*\*\/\*\.\w+$/,
  /^\*\*\/\*\.\{[^}]+\}$/,
  /^\*\*\/[\w-]+\.\w+$/,
  /^\*\.\w+$/,
  /^\*\.\{[^}]+\}$/
];

function isBuildCommand(command) {
  const cleaned = (command || '').trim();
  if (!cleaned) return false;
  return (
    BUILD_COMMAND_PATTERN.test(cleaned) ||
    TOOL_COMMAND_PATTERN.test(cleaned) ||
    NODE_BUILD_SCRIPT_PATTERN.test(cleaned) ||
    PYTHON_BUILD_PATTERN.test(cleaned) ||
    DENO_BUILD_PATTERN.test(cleaned) ||
    ZIG_BUILD_PATTERN.test(cleaned)
  );
}

function isBroadPattern(pattern) {
  const trimmed = (pattern || '').trim();
  if (!trimmed) return false;
  for (const regex of BROAD_PATTERN_REGEXES) {
    if (regex.test(trimmed)) return true;
  }
  return false;
}

function isPrivacySensitive(testPath) {
  if (!testPath) return false;
  const cleanPath = testPath.startsWith('APPROVED:') ? testPath.slice('APPROVED:'.length) : testPath;
  let normalized = cleanPath.replace(/\\/g, '/');

  try {
    normalized = decodeURIComponent(normalized);
  } catch {}

  const lastSlash = normalized.lastIndexOf('/');
  const basename = lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;

  for (const safe of SAFE_PATTERNS) {
    if (safe.test(basename)) return false;
  }

  for (const pattern of PRIVACY_PATTERNS) {
    if (pattern.test(basename) || pattern.test(normalized)) return true;
  }

  return false;
}

function compileScoutPatterns(patterns) {
  const compiled = [];
  for (const p of patterns) {
    const trimmed = (p || '').trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const isNegated = trimmed.startsWith('!');
    const raw = isNegated ? trimmed.slice(1).trim() : trimmed;
    const isDirOnly = raw.endsWith('/');
    const cleanRaw = isDirOnly ? raw.slice(0, -1) : raw;
    compiled.push({
      negated: isNegated,
      dirOnly: isDirOnly,
      raw: trimmed,
      normalized: cleanRaw.replace(/\\/g, '/')
    });
  }
  return compiled;
}

function matchesScoutPattern(testPath, compiledPatterns) {
  let normalized = (testPath || '').trim().replace(/\\/g, '/');
  try {
    normalized = decodeURIComponent(normalized);
  } catch {}
  while (normalized.startsWith('./')) normalized = normalized.slice(2);
  const segments = normalized.split('/').filter(Boolean);

  let blocked = false;
  let matchingPattern = undefined;

  for (const pat of compiledPatterns) {
    let matches = false;

    if (pat.dirOnly) {
      const target = pat.normalized;
      if (segments.includes(target) || normalized === target || normalized.startsWith(target + '/')) {
        matches = true;
      }
    } else {
      const target = pat.normalized;
      if (target.indexOf('*') !== -1) {
        const parts = target.split('*');
        let reg = '^';
        for (let i = 0; i < parts.length; i++) {
          if (i > 0) reg += '.*';
          reg += parts[i].replace(/[.+^$\[\](){}|\\]/g, '\\$&');
        }
        reg += '$';
        if (new RegExp(reg).test(normalized)) {
          matches = true;
        }
      } else {
        if (normalized === target || segments.includes(target)) {
          matches = true;
        }
      }
    }

    if (matches) {
      if (pat.negated) {
        blocked = false;
        matchingPattern = undefined;
      } else {
        blocked = true;
        matchingPattern = pat.raw;
      }
    }
  }

  return { blocked, pattern: matchingPattern };
}

function evaluateLocalPolicies(operation, config = {}) {
  if (operation.kind === 'unqualified') {
    return {
      decision: 'deny',
      reason: 'PreToolUse security policy denied unqualified tool "' + operation.toolName + '": ' + operation.reason,
      warnings: []
    };
  }

  const rawPatterns = config.patterns && config.patterns.length > 0 ? config.patterns : DEFAULT_SCOUT_PATTERNS;
  const compiledScout = compileScoutPatterns(rawPatterns);
  const warnings = [];

  const isTerminalBuild = operation.kind === 'terminal' && operation.command && isBuildCommand(operation.command);

  if (!isTerminalBuild) {
    for (const operand of operation.operands) {
      const scoutCheck = matchesScoutPattern(operand, compiledScout);
      if (scoutCheck.blocked) {
        return {
          decision: 'deny',
          reason: 'Scout policy blocked access to directory operand "' + operand + '" matching .evcrateignore pattern "' + scoutCheck.pattern + '"',
          warnings: []
        };
      }
    }
  }

  if (operation.kind === 'search' && operation.pattern && isBroadPattern(operation.pattern)) {
    const isRootSearch = operation.operands.length === 0 || operation.operands.every(
      (op) => op === '.' || op === './' || op === '' || op === '/'
    );
    if (isRootSearch) {
      return {
        decision: 'deny',
        reason: 'Scout policy blocked overly broad search pattern "' + operation.pattern + '" at project root. Narrow the search folder or specify a more targeted query.',
        warnings: []
      };
    }
  }

  if (config.privacyEnabled !== false) {
    for (const operand of operation.operands) {
      if (isPrivacySensitive(operand)) {
        if (operation.kind === 'read' || operation.kind === 'edit') {
          return {
            decision: 'ask',
            reason: 'Access to privacy-sensitive file "' + operand + '" requires explicit user confirmation.',
            warnings: []
          };
        } else if (operation.kind === 'terminal') {
          const warnMsg = 'Warning: Terminal command references privacy-sensitive path "' + operand + '". Note: File read access is not blocked in shell environment.';
          if (!warnings.includes(warnMsg)) {
            warnings.push(warnMsg);
          }
        }
      }
    }
  }

  return {
    decision: 'none',
    warnings,
    systemMessage: warnings.length > 0 ? warnings.join('\n') : undefined
  };
}

module.exports = {
  DEFAULT_SCOUT_PATTERNS,
  isBuildCommand,
  isBroadPattern,
  isPrivacySensitive,
  compileScoutPatterns,
  matchesScoutPattern,
  evaluateLocalPolicies
};
