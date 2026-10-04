import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

async function main() {
  const { runAllManifestsBuild } = await import('../dist/index.js');
  console.log('Building target projections and generating all manifests in single-pass');
  const result = runAllManifestsBuild(ROOT);
  console.log(`Successfully generated and verified ${result.allManifestPaths.length} manifests across ${result.targetBuilds.size} targets.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
