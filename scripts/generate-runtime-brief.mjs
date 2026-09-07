import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SOURCE = join(ROOT, '.evcrate', 'source', '.claude', 'skills', 'advisor-strategy', 'references', 'brief-contract.md');
const OUTPUT = join(ROOT, '.evcrate', 'source', '.evcrate', 'bin', 'lib', 'advisor', 'runtime-brief.generated.cjs');

function main() {
  const content = readFileSync(SOURCE, 'utf8');
  const match = /## Canonical Runtime Mentor Instructions[\s\S]*?```text\r?\n([\s\S]*?)\r?\n```/u.exec(content);
  if (!match) {
    throw new Error(`Canonical Runtime Mentor Instructions block not found in ${SOURCE}`);
  }
  const instructions = match[1].trim();
  const digest = createHash('sha256').update(instructions, 'utf8').digest('hex');
  const buildIdentity = `evcrate-advisor-v2-${digest.slice(0, 16)}`;

  const outputContent = `// Generated from scripts/generate-runtime-brief.mjs; do not edit directly.
'use strict';

const CANONICAL_MENTOR_INSTRUCTIONS = Object.freeze(${JSON.stringify(instructions)});
const CANONICAL_MENTOR_INSTRUCTIONS_DIGEST = Object.freeze(${JSON.stringify(digest)});
const ADVISOR_BUILD_IDENTITY = Object.freeze(${JSON.stringify(buildIdentity)});

module.exports = {
  CANONICAL_MENTOR_INSTRUCTIONS,
  CANONICAL_MENTOR_INSTRUCTIONS_DIGEST,
  ADVISOR_BUILD_IDENTITY
};
`;

  writeFileSync(OUTPUT, outputContent, 'utf8');
}

main();
