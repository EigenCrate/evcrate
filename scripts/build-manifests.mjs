import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

async function main() {
  const { runLocalBuild, PERSISTED_TARGETS } = await import('../dist/index.js');
  for (const target of PERSISTED_TARGETS) {
    console.log(`Building manifest for target: ${target}`);
    runLocalBuild(ROOT, [target]);
  }
  console.log('Building aggregate manifest for all targets');
  runLocalBuild(ROOT, PERSISTED_TARGETS);
  console.log('All manifests successfully built and verified.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
