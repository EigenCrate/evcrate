import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function parseJobsArg() {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--jobs' && i + 1 < args.length) {
      return args[i + 1];
    }
    if (arg.startsWith('--jobs=')) {
      return arg.slice('--jobs='.length);
    }
  }
  return undefined;
}

async function main() {
  const { runAllManifestsBuild } = await import('../dist/index.js');
  const jobsArg = parseJobsArg();
  const jobsDisplay = jobsArg !== undefined ? ` (jobs=${jobsArg})` : '';
  console.log(`Building target projections and generating all manifests in single-pass${jobsDisplay}`);
  const result = await runAllManifestsBuild(ROOT, jobsArg !== undefined ? { jobs: jobsArg } : {});
  console.log(`Successfully generated and verified ${result.allManifestPaths.length} manifests across ${result.targetBuilds.size} targets.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
