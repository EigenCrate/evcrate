import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

async function main() {
  const {
    scanCanonicalResources,
    resourceDocumentBytes,
    loadTargetManifestRegistry
  } = await import('../dist/index.js');

  const canonicalRoot = join(ROOT, '.evcrate', 'source', '.claude');
  const targetRegistryPath = join(ROOT, '.evcrate', 'targets', 'manifest.json');
  const targetRegistry = loadTargetManifestRegistry(targetRegistryPath);
  const registryPath = join(ROOT, '.evcrate', 'registry.json');

  let previous = [];
  let revision = 1;
  if (existsSync(registryPath)) {
    try {
      const doc = JSON.parse(readFileSync(registryPath, 'utf8'));
      if (Array.isArray(doc.resources)) {
        previous = doc.resources;
      }
      if (typeof doc.revision === 'number') {
        revision = doc.revision;
      }
    } catch {
      // Regenerate fresh if invalid
    }
  }

  const resources = scanCanonicalResources(canonicalRoot, targetRegistry.resourceRoots, previous);
  const document = {
    schema_version: 1,
    revision,
    resources
  };

  const bytes = resourceDocumentBytes(document);
  writeFileSync(registryPath, bytes);
  console.log(`Resource registry regenerated: ${resources.length} resources indexed at .evcrate/registry.json`);
}

main().catch((err) => {
  console.error('Failed to generate resource registry:', err);
  process.exit(1);
});
