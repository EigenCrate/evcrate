import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUTPUT = join(ROOT, 'src', 'manifests', 'controller-inventory.generated.ts');

export const ADVISOR_CONTROLLER_BINARY_FILES = Object.freeze([
  'lib/advisor/native/darwin/prebuilt/darwin-arm64/advisor-native.node',
  'lib/advisor/native/darwin/prebuilt/darwin-x64/advisor-native.node'
]);

export const ADVISOR_CONTROLLER_TEXT_DATA_FILES = Object.freeze([
  'lib/advisor/native/darwin/advisor-native.c',
  'lib/advisor/native/darwin/advisor-native.h',
  'lib/advisor/native/darwin/prebuilt/artifacts.json',
  'lib/advisor/native/darwin/process.c',
  'lib/advisor/native/darwin/storage.c',
  'lib/advisor/windows-native.cs',
  'lib/advisor/windows-native.ps1'
]);

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
  'lib/advisor/darwin-platform.cjs',
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
  'lib/advisor/native/darwin/advisor-native.c',
  'lib/advisor/native/darwin/advisor-native.h',
  'lib/advisor/native/darwin/prebuilt/artifacts.json',
  'lib/advisor/native/darwin/prebuilt/darwin-arm64/advisor-native.node',
  'lib/advisor/native/darwin/prebuilt/darwin-x64/advisor-native.node',
  'lib/advisor/native/darwin/process.c',
  'lib/advisor/native/darwin/storage.c',
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

function updateInstallSh() {
  const installShPath = join(ROOT, 'install.sh');
  if (!existsSync(installShPath)) return;
  const content = readFileSync(installShPath, 'utf8');
  const formatted = JSON.stringify(ADVISOR_CONTROLLER_FILES, null, 2)
    .split('\n')
    .map((line, i) => (i === 0 ? line : `  ${line}`))
    .join('\n');
  const replacement = `const ADVISOR_CONTROLLER_FILES = Object.freeze(${formatted});`;
  const updated = content.replace(/const ADVISOR_CONTROLLER_FILES = Object\.freeze\(\[\s*[\s\S]*?\s*\]\);/u, replacement);
  writeFileSync(installShPath, updated, 'utf8');
}

function updateInstallPs1() {
  const installPs1Path = join(ROOT, 'install.ps1');
  if (!existsSync(installPs1Path)) return;
  const content = readFileSync(installPs1Path, 'utf8');
  const ps1Lines = ADVISOR_CONTROLLER_FILES.map((f) => `    '${f}'`).join(',\n');
  const replacement = `$ADVISOR_CONTROLLER_FILES = @(\n${ps1Lines}\n)`;
  const updated = content.replace(/\$ADVISOR_CONTROLLER_FILES = @\(\s*[\s\S]*?\s*\)/u, replacement);
  writeFileSync(installPs1Path, updated, 'utf8');
}

function main() {
  const entries = JSON.stringify(ADVISOR_CONTROLLER_FILES, null, 2);
  const binaryEntries = JSON.stringify(ADVISOR_CONTROLLER_BINARY_FILES, null, 2);
  const textEntries = JSON.stringify(ADVISOR_CONTROLLER_TEXT_DATA_FILES, null, 2);
  const builtins = JSON.stringify(
    [...new Set(builtinModules.map((m) => m.startsWith('node:') ? m.slice(5) : m))].sort(),
    null,
    2
  );
  const content = `// Generated from scripts/generate-controller-inventory.mjs; do not edit.
export const ADVISOR_CONTROLLER_FILES = Object.freeze(${entries} as const);
export const ADVISOR_CONTROLLER_BINARY_FILES = Object.freeze(${binaryEntries} as const);
export const ADVISOR_CONTROLLER_TEXT_DATA_FILES = Object.freeze(${textEntries} as const);
export const ADVISOR_CONTROLLER_NODE_BUILTINS = Object.freeze(${builtins} as const);
`;
  writeFileSync(OUTPUT, content, 'utf8');
  updateInstallSh();
  updateInstallPs1();
}

main();
