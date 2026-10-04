#!/usr/bin/env node
/**
 * redact-vscode-local-evidence.mjs
 *
 * Sanitizes captured VS Code Local hook and event evidence for repository inclusion.
 * Replaces usernames, absolute filesystem paths, session IDs, and timestamps with
 * deterministic, anonymized placeholders while preserving event ordering, schema shapes,
 * decision fields, and tool contracts.
 *
 * Usage:
 *   node scripts/qualification/redact-vscode-local-evidence.mjs \
 *     --input <raw-events.jsonl-or-json> \
 *     --output <sanitized-output-path>
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const SECRET_PATTERNS = [
  /Bearer\s+[A-Za-z0-9_\-\.+=]+/gi,
  /(?:sk|ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{16,}/gi,
  /[A-Fa-f0-9]{32,64}/g // Hash/secret candidates if isolated
];

/**
 * Creates a redaction context to map dynamic identifiers consistently across records.
 */
export function createRedactionContext(options = {}) {
  const currentUsername = process.env.USER || process.env.USERNAME || 'operator';
  const homeDir = process.env.HOME || (process.env.USERPROFILE || '/home/operator');
  const projectRoot = options.projectRoot || process.cwd();

  return {
    currentUsername,
    homeDir: path.normalize(homeDir),
    projectRoot: path.normalize(projectRoot),
    sessionIdMap: new Map(),
    nextSessionIndex: 1,
    baseTimestamp: 1700000000000,
    timestampOffset: 0,
    stats: {
      recordsProcessed: 0,
      pathsRedacted: 0,
      sessionsRedacted: 0,
      secretsRedacted: 0
    }
  };
}

/**
 * Redacts a single string value according to allowlisted replacement rules.
 */
export function redactString(str, ctx) {
  if (typeof str !== 'string' || !str) return str;

  let result = str;

  // 1. Redact project root references first (more specific than home)
  if (ctx.projectRoot && result.includes(ctx.projectRoot)) {
    result = result.split(ctx.projectRoot).join('/path/to/project');
    ctx.stats.pathsRedacted++;
  }

  // 2. Redact home directory
  if (ctx.homeDir && result.includes(ctx.homeDir)) {
    result = result.split(ctx.homeDir).join('/home/test-user');
    ctx.stats.pathsRedacted++;
  }

  // 3. Redact POSIX and Windows home user paths
  result = result.replace(/\/home\/[a-zA-Z0-9_\-]+/g, '/home/test-user');
  result = result.replace(/[A-Za-z]:\\Users\\[a-zA-Z0-9_\-]+/g, 'C:\\Users\\test-user');

  // 4. Redact raw username
  if (ctx.currentUsername && ctx.currentUsername.length > 2 && result.includes(ctx.currentUsername)) {
    result = result.split(ctx.currentUsername).join('test-user');
  }

  // 5. Redact UUIDs representing session IDs or tool use IDs consistently
  result = result.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, (match) => {
    const lower = match.toLowerCase();
    if (!ctx.sessionIdMap.has(lower)) {
      const idx = String(ctx.nextSessionIndex++).padStart(12, '0');
      ctx.sessionIdMap.set(lower, `00000000-0000-4000-8000-${idx}`);
      ctx.stats.sessionsRedacted++;
    }
    return ctx.sessionIdMap.get(lower);
  });

  // 6. Redact potential bearer tokens / API keys
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(result)) {
      result = result.replace(pattern, '[REDACTED_SECRET]');
      ctx.stats.secretsRedacted++;
    }
  }

  return result;
}

/**
 * Recursively redacts an arbitrary JSON object, array, or primitive.
 */
export function redactValue(val, ctx) {
  if (val === null || val === undefined) return val;

  if (typeof val === 'string') {
    return redactString(val, ctx);
  }

  if (typeof val === 'number') {
    // Normalize timestamps (13-digit millisecond epoch timestamps)
    if (val > 1500000000000 && val < 2000000000000) {
      const normalized = ctx.baseTimestamp + ctx.timestampOffset;
      ctx.timestampOffset += 1000;
      return normalized;
    }
    return val;
  }

  if (typeof val === 'boolean') {
    return val;
  }

  if (Array.isArray(val)) {
    return val.map((item) => redactValue(item, ctx));
  }

  if (typeof val === 'object') {
    const redactedObj = {};
    for (const [key, prop] of Object.entries(val)) {
      redactedObj[key] = redactValue(prop, ctx);
    }
    return redactedObj;
  }

  return val;
}

/**
 * Redacts a parsed event record.
 */
export function redactRecord(record, ctx) {
  ctx.stats.recordsProcessed++;
  return redactValue(record, ctx);
}

/**
 * Redacts an input file (JSON or JSONL) and writes the sanitized output.
 */
export function redactFile(inputPath, outputPath, options = {}) {
  const ctx = createRedactionContext(options);
  const rawContent = fs.readFileSync(inputPath, 'utf8');

  let sanitizedContent = '';
  const trimmed = rawContent.trim();

  if (trimmed.startsWith('{') && !trimmed.includes('\n')) {
    // Single JSON object
    const parsed = JSON.parse(trimmed);
    const sanitized = redactRecord(parsed, ctx);
    sanitizedContent = JSON.stringify(sanitized, null, 2) + '\n';
  } else if (trimmed.startsWith('[')) {
    // JSON Array
    const parsed = JSON.parse(trimmed);
    const sanitized = parsed.map((item) => redactRecord(item, ctx));
    sanitizedContent = JSON.stringify(sanitized, null, 2) + '\n';
  } else {
    // JSONL (one record per line)
    const lines = rawContent.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const sanitizedLines = lines.map((line) => {
      try {
        const parsed = JSON.parse(line);
        const redacted = redactRecord(parsed, ctx);
        return JSON.stringify(redacted);
      } catch {
        return redactString(line, ctx);
      }
    });
    sanitizedContent = sanitizedLines.join('\n') + '\n';
  }

  if (outputPath) {
    fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
    fs.writeFileSync(outputPath, sanitizedContent, 'utf8');
  }

  return {
    content: sanitizedContent,
    stats: ctx.stats,
    digest: crypto.createHash('sha256').update(sanitizedContent, 'utf8').digest('hex')
  };
}

function parseArgs(args) {
  const parsed = {
    input: null,
    output: null,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--input' || arg === '-i') {
      parsed.input = args[++i];
    } else if (arg === '--output' || arg === '-o') {
      parsed.output = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    }
  }
  return parsed;
}

function showHelp() {
  console.log(`
Usage:
  node scripts/qualification/redact-vscode-local-evidence.mjs [options]

Options:
  --input, -i <path>    Input file to sanitize (.json or .jsonl) (required)
  --output, -o <path>   Output file destination for sanitized content (required)
  --help, -h            Show this help message
`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || !opts.input || !opts.output) {
    showHelp();
    process.exit(opts.help ? 0 : 1);
  }

  const result = redactFile(opts.input, opts.output);
  console.log(JSON.stringify({
    status: 'SANITY_REDACTED',
    output: opts.output,
    digest: result.digest,
    stats: result.stats
  }, null, 2));
}
