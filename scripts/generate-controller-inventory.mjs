import { writeFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUTPUT = join(ROOT, 'src', 'manifests', 'controller-inventory.generated.ts');

export const ADVISOR_CONTROLLER_FILES = Object.freeze([
  'evcrate-advisor',
  'lib/advisor/adapter-contract.cjs',
  'lib/advisor/adapter-registry.cjs',
  'lib/advisor/adapters/claude.cjs',
  'lib/advisor/adapters/codex.cjs',
  'lib/advisor/adapters/omp.cjs',
  'lib/advisor/adapters/omp-parser.cjs',
  'lib/advisor/adapters/pi.cjs',
  'lib/advisor/checkpoint-contract.cjs',
  'lib/advisor/contracts-v2.cjs',
  'lib/advisor/controller-envelope.cjs',
  'lib/advisor/controller.cjs',
  'lib/advisor/errors.cjs',
  'lib/advisor/generated/advisor-contract-runtime.js',
  'lib/advisor/generated/advisor-metrics.js',
  'lib/advisor/generated/canonical-json.js',
  'lib/advisor/generated/json.js',
  'lib/advisor/history-contract.cjs',
  'lib/advisor/history-prune.cjs',
  'lib/advisor/history-query.cjs',
  'lib/advisor/history-store.cjs',
  'lib/advisor/isolated-workspace.cjs',
  'lib/advisor/json-document.cjs',
  'lib/advisor/managed-checkpoint.cjs',
  'lib/advisor/policy-schema.cjs',
  'lib/advisor/profile.cjs',
  'lib/advisor/runner.cjs',
  'lib/advisor/runtime-brief.generated.cjs',
  'lib/advisor/state-baseline.cjs',
  'lib/advisor/state-contract.cjs',
  'lib/advisor/state-human.cjs',
  'lib/advisor/state-io.cjs',
  'lib/advisor/task-state.cjs',
  'lib/advisor/windows-native.cs',
  'lib/advisor/windows-native.ps1',
  'lib/advisor/windows-platform.cjs'
]);

function main() {
  const entries = JSON.stringify(ADVISOR_CONTROLLER_FILES, null, 2);
  const builtins = JSON.stringify(
    [...new Set(builtinModules.map((m) => m.startsWith('node:') ? m.slice(5) : m))].sort(),
    null,
    2
  );
  const content = `// Generated from scripts/generate-controller-inventory.mjs; do not edit.
export const ADVISOR_CONTROLLER_FILES = Object.freeze(${entries} as const);
export const ADVISOR_CONTROLLER_NODE_BUILTINS = Object.freeze(${builtins} as const);
`;
  writeFileSync(OUTPUT, content, 'utf8');
}

main();
