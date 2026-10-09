import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname } from "node:path";

import { resolveContainedExistingPath } from "./paths.js";

export const COMMAND_TIMEOUT_MS = 30_000;
export const MAX_COMMAND_OUTPUT_BYTES = 50_000;
export const MAX_COMMAND_OUTPUT_LINES = 2_000;

function value(frontmatter, key) {
  const match = new RegExp(`^\\s*${key}\\s*:\\s*(.+?)\\s*$`, "m").exec(frontmatter);
  return match ? match[1].replace(/^(?:"|')|(?:"|')$/g, "").trim() : "";
}

export function parseCommandFile(content) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n)?/.exec(content);
  const frontmatter = match?.[1] || "";
  const body = (match ? content.slice(match[0].length) : content).trim();
  const description = value(frontmatter, "description") || body.split("\n").find(Boolean)?.slice(0, 120) || "";
  return {
    body,
    description,
    argumentHint: value(frontmatter, "argument-hint") || undefined,
    disableModelInvocation: value(frontmatter, "disable-model-invocation") === "true",
  };
}

export function splitArguments(input) {
  const args = [];
  let current = "";
  let quote;
  let escaped = false;
  for (const char of input.trim()) {
    if (escaped) { current += char; escaped = false; continue; }
    if (char === "\\") { escaped = true; continue; }
    if (quote) {
      if (char === quote) quote = undefined;
      else current += char;
    } else if (char === "'" || char === '"') quote = char;
    else if (/\s/.test(char)) {
      if (current) { args.push(current); current = ""; }
    } else current += char;
  }
  if (escaped) current += "\\";
  if (quote) throw new Error("Unterminated quoted command argument");
  if (current) args.push(current);
  return args;
}

export function substituteArguments(body, rawArgs) {
  if (typeof rawArgs !== "string") throw new Error("EVCrate commands require raw string arguments");
  let args;
  const getArgs = () => {
    if (!args) args = splitArguments(rawArgs);
    return args;
  };
  const placeholder = /\$\{ARGUMENTS:-([^}]*)\}|\$\{(\d+):-([^}]*)\}|\$ARGUMENTS\b|\$@|\$(\d+)/g;
  return body.replace(placeholder, (match, argumentFallback, positionalIndex, positionalFallback, simpleIndex) => {
    if (match.startsWith("${ARGUMENTS:-")) return rawArgs || argumentFallback;
    const index = positionalIndex ?? simpleIndex;
    if (index !== undefined) return getArgs()[Number(index) - 1] ?? (positionalFallback ?? "");
    return rawArgs;
  });
}

const COMMAND_PREFIX = "evc-cmd-";
const SEGMENT_SEPARATOR = "-x-";
const MAX_NAME_LENGTH = 64;
const KEBAB_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Advisor semantic id (`evc-cmd-code-x-auto` -> `code/auto`), or undefined when `name` is not a valid
 * flat command name. Twin of `parseCommandName` in src/adapters/resource-naming.ts (the installed
 * runtime cannot import src/); tests/adapters/pi-command-name-parity.test.mjs keeps them identical.
 */
export function semanticIdFor(name) {
  if (typeof name !== "string" || name.length > MAX_NAME_LENGTH || !KEBAB_NAME.test(name) || !name.startsWith(COMMAND_PREFIX)) return undefined;
  const segments = name.slice(COMMAND_PREFIX.length).split(SEGMENT_SEPARATOR);
  return segments.every((segment) => KEBAB_NAME.test(segment) && !segment.split("-").includes("x")) ? segments.join("/") : undefined;
}

/** Flat command name = file stem. */
export function commandNameFor(relativePath) {
  return relativePath.slice(0, -extname(relativePath).length);
}

export function canonicalCommandNameFor(relativePath) {
  return semanticIdFor(commandNameFor(relativePath));
}

/** Command files are flat `evc-cmd-*.md`; nested directories and non-command stems are ignored. */
export function discoverCommandFiles(root) {
  const commands = [];
  let entries;
  try { entries = readdirSync(root, { withFileTypes: true }); } catch { return commands; }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile() || extname(entry.name) !== ".md") continue;
    const canonicalName = canonicalCommandNameFor(entry.name);
    const filePath = canonicalName && resolveContainedExistingPath(root, entry.name);
    if (filePath) commands.push({ name: commandNameFor(entry.name), canonicalName, filePath });
  }
  return commands;
}

export function fencedRanges(text) {
  const ranges = [];
  const fence = /^(?:```|~~~)[^\n]*$/gm;
  let open;
  for (let match; (match = fence.exec(text)); ) {
    if (open === undefined) open = match.index;
    else { ranges.push([open, match.index + match[0].length]); open = undefined; }
  }
  if (open !== undefined) ranges.push([open, text.length]);
  return ranges;
}

function inRanges(ranges, index, end = index) {
  return ranges.some(([start, finish]) => index < finish && end > start);
}

export function truncateOutput(text) {
  const lines = String(text).split("\n");
  let result = "";
  let kept = 0;
  for (const line of lines) {
    const next = `${result}${kept ? "\n" : ""}${line}`;
    if (kept === MAX_COMMAND_OUTPUT_LINES || Buffer.byteLength(next) > MAX_COMMAND_OUTPUT_BYTES) break;
    result = next;
    kept += 1;
  }
  return kept === lines.length ? result : `${result}\n[command output truncated]`;
}

function authoredEvents(body) {
  const ranges = fencedRanges(body);
  const commands = [];
  const commandPattern = /!`([^`\r\n]+)`/g;
  for (let match; (match = commandPattern.exec(body)); ) {
    if (!inRanges(ranges, match.index, match.index + match[0].length)) commands.push({ ...match, type: "command" });
  }
  const files = [];
  const filePattern = /(^|[\s(])@([A-Za-z0-9_./-]+)/gm;
  for (let match; (match = filePattern.exec(body)); ) {
    const start = match.index + match[1].length;
    if (!inRanges(ranges, start, start + match[2].length) && !commands.some((item) => inRanges([[item.index, item.index + item[0].length]], start, start + match[2].length))) {
      files.push({ index: start, 0: `@${match[2]}`, 1: match[2], type: "file" });
    }
  }
  return [...commands, ...files].sort((a, b) => a.index - b.index);
}

export async function expandCommandBody(body, rawArgs, { cwd, execute, resolveMarkers = (text) => text }) {
  const marked = resolveMarkers(body);
  const events = authoredEvents(marked);
  let result = "";
  let cursor = 0;
  for (const event of events) {
    result += substituteArguments(marked.slice(cursor, event.index), rawArgs);
    if (event.type === "command") {
      const run = await execute(event[1]);
      const output = run.code === 0 ? run.stdout : `(command failed: ${event[1]})\n${run.stderr || run.stdout}`;
      result += truncateOutput(output).trimEnd();
    } else {
      try {
        const filePath = resolveContainedExistingPath(cwd, event[1]);
        if (!filePath || !statSync(filePath).isFile()) result += event[0];
        else result += `\n<file path="${event[1]}">\n${truncateOutput(readFileSync(filePath, "utf8")).trimEnd()}\n</file>\n`;
      } catch { result += event[0]; }
    }
    cursor = event.index + event[0].length;
  }
  return result + substituteArguments(marked.slice(cursor), rawArgs);
}
