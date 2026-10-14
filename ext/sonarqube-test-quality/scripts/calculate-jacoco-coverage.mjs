#!/usr/bin/env node
import { createReadStream, promises as fs, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const currentDir = dirname(fileURLToPath(import.meta.url));
const saxPath = join(currentDir, 'vendor', 'sax.cjs');
const sax = require(saxPath);

export const HELP = `Usage: node calculate-jacoco-coverage.mjs [options]
       node calculate-jacoco-coverage.mjs --help

Options:
  --report-path <path>       Path to jacoco.xml (default: target/site/jacoco/jacoco.xml).
  --threshold <val>          Strict combined-coverage threshold percentage (default: 95).
  --include-pattern <regex>  Optional case-insensitive regex matching class names to include.
  --help                     Show this help; use alone.

Path Resolution:
  - Relative --report-path resolves against initial caller working directory.

Calculation & Aggregation:
  - Aggregates direct child LINE and BRANCH counters of matched classes only.
  - Counters from method, sourcefile, package, group, or report elements are excluded from aggregation.
  - Every evaluated class requires a direct LINE counter; missing LINE is invalid input (exit 1).
  - Present zero-valued LINE counters are valid.
  - Absent BRANCH counters are treated as undefined/empty and do not fail the combined metric.
  - Strict predicate: (covered lines + covered branches) / (total lines + total branches) * 100 > threshold.
  - Evaluated using exact BigInt rational arithmetic without floating-point rounding.

Exit Codes:
  - 0: Passed strict threshold requirement.
  - 1: Invalid input, invalid arguments, report not found, malformed XML, or invalid counters.
  - 2: Below threshold requirement, or no covered classes / zero combined counters matched.

Intentional Changes from .ps1 & Migration Limits:
  - Node >=22.19.0 ESM execution without PowerShell dependency.
  - Structural XML streaming parser with strict validation and DTD entity rejection.
  - Strict duplicate attribute rejection.
  - Case-insensitive class pattern uses JavaScript RegExp with 'i' flag (.NET regex differences documented).
  - Empty --include-pattern "" is treated as a missing argument value; non-empty values starting with dash are rejected.
  - Strict fatal UTF-8 encoding (UTF-16 or other non-UTF-8 encodings are rejected).
  - Exact BigInt rational arithmetic replaces 64-bit binary floating-point comparisons.
  - All encountered classes and direct counters must conform to valid numeric ranges.
`;

const LEGAL_PARENTS = {
  sessioninfo: ['report'],
  group: ['report', 'group'],
  package: ['report', 'group'],
  class: ['package'],
  sourcefile: ['package'],
  line: ['sourcefile'],
  method: ['class'],
  counter: ['report', 'group', 'package', 'class', 'sourcefile', 'method'],
};

const ALLOWED_FLAGS = {
  '--report-path': 'reportPath',
  '--threshold': 'threshold',
  '--include-pattern': 'includePattern',
};

export class HelperError extends Error {
  constructor(category, message) {
    super(message);
    this.name = 'HelperError';
    this.category = category;
  }
}

export function parseThreshold(val) {
  if (typeof val !== 'string' || !/^[0-9]+(?:\.[0-9]+)?$/.test(val)) {
    throw new HelperError('argument', 'Threshold must be an unsigned base-10 decimal between 0 and 100.');
  }

  const parts = val.split('.');
  const integerPart = parts[0];
  const fractionalPart = parts[1] ?? '';

  let numerator;
  let denominator;

  if (fractionalPart.length === 0) {
    numerator = BigInt(integerPart);
    denominator = 1n;
  } else {
    denominator = 10n ** BigInt(fractionalPart.length);
    numerator = BigInt(integerPart) * denominator + BigInt(fractionalPart);
  }

  if (numerator > 100n * denominator) {
    throw new HelperError('argument', 'Threshold must be between 0 and 100.');
  }

  return {
    display: val,
    numerator,
    denominator,
  };
}

export function parseArguments(args) {
  if (args.length === 1 && args[0] === '--help') {
    return { help: true };
  }
  if (args.includes('--help')) {
    throw new HelperError('argument', 'Option --help must be used alone.');
  }

  const options = {};
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    const key = Object.hasOwn(ALLOWED_FLAGS, flag) ? ALLOWED_FLAGS[flag] : null;
    if (!key) {
      throw new HelperError('argument', 'Unsupported option.');
    }
    if (Object.hasOwn(options, key)) {
      throw new HelperError('argument', 'Repeated option.');
    }
    const value = args[++i];
    if (value === undefined || value === '') {
      throw new HelperError('argument', 'Missing value for option.');
    }
    if (value.startsWith('-')) {
      throw new HelperError('argument', 'Invalid value for option.');
    }
    options[key] = value;
  }

  options.reportPath = options.reportPath ?? 'target/site/jacoco/jacoco.xml';
  options.thresholdRaw = options.threshold ?? '95';
  options.threshold = parseThreshold(options.thresholdRaw);

  if (options.includePattern !== undefined) {
    try {
      options.compiledPattern = new RegExp(options.includePattern, 'i');
    } catch (err) {
      throw new HelperError('argument', `Invalid regular expression for --include-pattern: ${err.message}`);
    }
  } else {
    options.compiledPattern = null;
  }

  return options;
}

export async function parseJacocoReportStream(readableStream, options) {
  const { compiledPattern } = options;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const parser = sax.parser(true, { strictEntities: true });

  let rootCount = 0;
  const elementStack = [];
  let currentClass = null;
  let linesMissed = 0;
  let linesCovered = 0;
  let branchesMissed = 0;
  let branchesCovered = 0;
  let classesEvaluated = 0;

  let xmlDeclarationChecked = false;
  let xmlHeaderBuffer = '';

  parser.onerror = (err) => {
    throw new HelperError('xml', `XML parsing error: ${err.message}`);
  };

  parser.ondoctype = (doctypeStr) => {
    if (
      doctypeStr.includes('[') ||
      /<!ENTITY/i.test(doctypeStr) ||
      /<!ELEMENT/i.test(doctypeStr) ||
      /<!ATTLIST/i.test(doctypeStr)
    ) {
      throw new HelperError('xml', 'Internal DTD subset and custom entity declarations are rejected.');
    }
  };

  parser.onopentagstart = () => {
    const seenAttributes = new Set();
    const target = {};
    parser.tag.attributes = new Proxy(target, {
      get(obj, prop, receiver) {
        if (prop === 'hasOwnProperty') {
          return (name) => {
            if (seenAttributes.has(name)) {
              throw new HelperError('xml', `Duplicate attribute "${name}" in element <${parser.tagName}>.`);
            }
            seenAttributes.add(name);
            return false;
          };
        }
        return Reflect.get(obj, prop, receiver);
      },
      set(obj, prop, value, receiver) {
        return Reflect.set(obj, prop, value, receiver);
      },
    });
  };

  parser.onopentag = (tag) => {
    if (elementStack.length === 0) {
      rootCount++;
      if (rootCount > 1) {
        throw new HelperError('xml', 'Multiple root elements rejected.');
      }
      if (tag.name !== 'report') {
        throw new HelperError('xml', `Expected root element <report>, got <${tag.name}>.`);
      }
    } else {
      const parent = elementStack[elementStack.length - 1];
      if (!Object.hasOwn(LEGAL_PARENTS, tag.name)) {
        throw new HelperError('xml', `Unexpected element <${tag.name}> inside JaCoCo report.`);
      }
      if (!LEGAL_PARENTS[tag.name].includes(parent.name)) {
        throw new HelperError(
          'xml',
          `Invalid element hierarchy: <${tag.name}> cannot be a child of <${parent.name}>.`
        );
      }
    }

    elementStack.push(tag);

    if (tag.name === 'class') {
      if (!tag.attributes.name) {
        throw new HelperError('xml', 'Class element is missing required "name" attribute.');
      }
      const isSelected = !compiledPattern || compiledPattern.test(tag.attributes.name);
      currentClass = {
        name: tag.attributes.name,
        selected: isSelected,
        seenCounters: new Set(),
        lineCounter: null,
        branchCounter: null,
      };
    } else if (tag.name === 'counter') {
      const parent = elementStack[elementStack.length - 2];
      if (!tag.attributes.type || tag.attributes.missed === undefined || tag.attributes.covered === undefined) {
        throw new HelperError('xml', 'Counter element missing required attributes (type, missed, covered).');
      }

      const type = tag.attributes.type;
      const missedStr = tag.attributes.missed;
      const coveredStr = tag.attributes.covered;

      if (!/^[0-9]+$/.test(missedStr) || !/^[0-9]+$/.test(coveredStr)) {
        throw new HelperError(
          'xml',
          `Counter attributes "missed" and "covered" must be non-negative decimal integers, got missed="${missedStr}" covered="${coveredStr}".`
        );
      }

      const missedNum = Number(missedStr);
      const coveredNum = Number(coveredStr);
      if (!Number.isSafeInteger(missedNum) || !Number.isSafeInteger(coveredNum)) {
        throw new HelperError(
          'xml',
          `Counter value exceeds safe integer limit: missed=${missedStr}, covered=${coveredStr}.`
        );
      }
      if (missedNum + coveredNum > Number.MAX_SAFE_INTEGER) {
        throw new HelperError('xml', 'Counter sum exceeds safe integer limit.');
      }

      if (parent.name === 'class' && currentClass) {
        if (currentClass.seenCounters.has(type)) {
          throw new HelperError('xml', `Duplicate counter type "${type}" in class ${currentClass.name}.`);
        }
        currentClass.seenCounters.add(type);

        if (currentClass.selected) {
          if (type === 'LINE') {
            currentClass.lineCounter = { missed: missedNum, covered: coveredNum };
          } else if (type === 'BRANCH') {
            currentClass.branchCounter = { missed: missedNum, covered: coveredNum };
          }
        }
      }
    }
  };

  parser.onclosetag = (tagName) => {
    elementStack.pop();

    if (tagName === 'class' && currentClass) {
      if (currentClass.selected) {
        if (!currentClass.lineCounter) {
          throw new HelperError(
            'xml',
            `Selected class "${currentClass.name}" is missing required direct LINE counter.`
          );
        }

        if (
          linesMissed + currentClass.lineCounter.missed > Number.MAX_SAFE_INTEGER ||
          linesCovered + currentClass.lineCounter.covered > Number.MAX_SAFE_INTEGER
        ) {
          throw new HelperError('xml', 'Accumulated line counter sum exceeds safe integer limit.');
        }
        linesMissed += currentClass.lineCounter.missed;
        linesCovered += currentClass.lineCounter.covered;

        if (currentClass.branchCounter) {
          if (
            branchesMissed + currentClass.branchCounter.missed > Number.MAX_SAFE_INTEGER ||
            branchesCovered + currentClass.branchCounter.covered > Number.MAX_SAFE_INTEGER
          ) {
            throw new HelperError('xml', 'Accumulated branch counter sum exceeds safe integer limit.');
          }
          branchesMissed += currentClass.branchCounter.missed;
          branchesCovered += currentClass.branchCounter.covered;
        }

        classesEvaluated++;
      }
      currentClass = null;
    }
  };

  parser.ontext = (text) => {
    if (elementStack.length === 0 && text.trim() !== '') {
      throw new HelperError('xml', 'Non-whitespace content outside root element.');
    }
  };

  for await (const chunk of readableStream) {

    let text;
    try {
      text = decoder.decode(chunk, { stream: true });
    } catch {
      throw new HelperError('encoding', 'JaCoCo report is not valid UTF-8.');
    }

    if (!xmlDeclarationChecked) {
      xmlHeaderBuffer += text;
      const trimmedHeader = xmlHeaderBuffer.trimStart();
      if (trimmedHeader.length > 0) {
        if ('<?xml'.startsWith(trimmedHeader)) {
          // Incomplete prefix of <?xml declaration, wait for further bytes
        } else if (trimmedHeader.startsWith('<?xml')) {
          const declMatch = trimmedHeader.match(/^<\?xml\b([^>]*)\?>/);
          if (declMatch) {
            xmlDeclarationChecked = true;
            const encMatch = declMatch[1].match(/\bencoding\s*=\s*["']([^"']+)["']/i);
            if (encMatch) {
              const enc = encMatch[1].toLowerCase();
              if (enc !== 'utf-8' && enc !== 'utf8') {
                throw new HelperError('encoding', `Unsupported XML encoding "${encMatch[1]}". Only UTF-8 is supported.`);
              }
            }
          } else if (trimmedHeader.length > 2048) {
            xmlDeclarationChecked = true;
          }
        } else {
          xmlDeclarationChecked = true;
        }
      }
    }
    parser.write(text);
  }

  let flushedText;
  try {
    flushedText = decoder.decode();
  } catch {
    throw new HelperError('encoding', 'JaCoCo report is not valid UTF-8: incomplete multi-byte sequence at EOF.');
  }

  if (flushedText) {
    parser.write(flushedText);
  }

  parser.close();

  if (rootCount === 0) {
    throw new HelperError('xml', 'JaCoCo report is empty: no root element found.');
  }
  if (elementStack.length !== 0) {
    throw new HelperError('xml', 'JaCoCo report contains unclosed XML elements.');
  }

  return {
    classesEvaluated,
    linesMissed,
    linesCovered,
    branchesMissed,
    branchesCovered,
  };
}

export async function calculateJacocoCoverage(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const cwd = io.cwd ?? process.cwd();

  let options;
  try {
    options = parseArguments(args);
  } catch (err) {
    const category = err instanceof HelperError ? err.category : 'argument';
    stderr.write(`calculate-jacoco-coverage: [${category} error] ${err.message}\n`);
    return 1;
  }

  if (options.help) {
    stdout.write(HELP);
    return 0;
  }

  const resolvedReportPath = resolve(cwd, options.reportPath);

  const fileMissingMsg = `calculate-jacoco-coverage: [report error] JaCoCo report not found or not a regular file at '${resolvedReportPath}'. Run the clean test suite first.\n`;
  try {
    const st = await fs.stat(resolvedReportPath);
    if (!st.isFile()) {
      stderr.write(fileMissingMsg);
      return 1;
    }
  } catch {
    stderr.write(fileMissingMsg);
    return 1;
  }

  let metrics;
  try {
    const fileStream = createReadStream(resolvedReportPath);
    metrics = await parseJacocoReportStream(fileStream, options);
  } catch (err) {
    const category = err instanceof HelperError ? err.category : 'report';
    const msg = err instanceof HelperError ? err.message : `Failed to read JaCoCo report: ${err.message}`;
    stderr.write(`calculate-jacoco-coverage: [${category} error] ${msg}\n`);
    return 1;
  }
  const { classesEvaluated, linesMissed, linesCovered, branchesMissed, branchesCovered } = metrics;
  const linesTotal = linesMissed + linesCovered;
  const branchesTotal = branchesMissed + branchesCovered;
  const combinedTotal = linesTotal + branchesTotal;

  if (
    linesTotal > Number.MAX_SAFE_INTEGER ||
    branchesTotal > Number.MAX_SAFE_INTEGER ||
    combinedTotal > Number.MAX_SAFE_INTEGER
  ) {
    stderr.write('calculate-jacoco-coverage: [xml error] Total counter values exceed safe integer limit.\n');
    return 1;
  }

  if (classesEvaluated === 0 || combinedTotal === 0) {
    stderr.write('calculate-jacoco-coverage: [coverage error] No covered classes or line/branch counters matched the requested scope.\n');
    return 2;
  }

  const linePercentStr = linesTotal > 0 ? `${(100.0 * linesCovered / linesTotal).toFixed(2)}%` : 'undefined/empty';
  const branchPercentStr = branchesTotal > 0 ? `${(100.0 * branchesCovered / branchesTotal).toFixed(2)}%` : 'undefined/empty';
  const combinedPercent = 100.0 * (linesCovered + branchesCovered) / combinedTotal;
  const combinedPercentStr = `${combinedPercent.toFixed(4)}%`;

  stdout.write(`Classes evaluated : ${classesEvaluated}\n`);
  stdout.write(`Line coverage     : ${linesCovered}/${linesTotal} (${linePercentStr})\n`);
  stdout.write(`Branch coverage   : ${branchesCovered}/${branchesTotal} (${branchPercentStr})\n`);
  stdout.write(`Combined coverage : ${linesCovered + branchesCovered}/${combinedTotal} (${combinedPercentStr})\n`);
  stdout.write(`Required          : > ${options.threshold.display}%\n`);

  const coveredCombinedBig = BigInt(linesCovered + branchesCovered);
  const totalCombinedBig = BigInt(combinedTotal);
  const passed = 100n * coveredCombinedBig * options.threshold.denominator > options.threshold.numerator * totalCombinedBig;

  if (passed) {
    stdout.write('RESULT            : PASSED\n');
    return 0;
  } else {
    stdout.write('RESULT            : FAILED\n');
    return 2;
  }
}

function directlyInvoked() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (directlyInvoked()) {
  calculateJacocoCoverage(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      const category = error instanceof HelperError ? error.category : 'internal';
      process.stderr.write(`calculate-jacoco-coverage: [${category} error] ${error.message || 'An unexpected error occurred.'}\n`);
      process.exitCode = 1;
    });
}
