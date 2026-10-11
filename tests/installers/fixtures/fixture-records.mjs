import crypto from 'node:crypto';

export const FIXTURE_BUILD_TIMESTAMP = '2026-01-01T00:00:00.000Z';

export function createMinimalValidRecords(version = '1.0.0') {
  const pkgJson = Buffer.from(JSON.stringify({
    name: 'evcrate',
    version,
    bin: { evcrate: 'dist/cli/evcrate.js' },
    engines: { node: '>=22.19.0' }
  }, null, 2) + '\n');

  const cliScript = Buffer.from(
    '#!/usr/bin/env node\n' +
    'const args = process.argv.slice(2);\n' +
    'if (args.includes("version") && args.includes("--json")) {\n' +
    `  process.stdout.write(JSON.stringify({ protocol: "evcrate-resource-control", protocolVersion: 1, operation: "version", status: "ok", payload: { version: "${version}" } }) + "\\n");\n` +
    '  process.exit(0);\n' +
    '}\n' +
    'process.stdout.write("evcrate cli\\n");\n'
  );

  const dummyJs = Buffer.from('"use strict";\nmodule.exports = {};\n');
  const dummyJson = Buffer.from('{}\n');

  const records = [
    { path: 'package.json', mode: 0o644, data: pkgJson },
    { path: 'dist/cli/evcrate.js', mode: 0o755, data: cliScript },
    { path: 'dist/index.js', mode: 0o644, data: dummyJs },
    { path: 'dist/distribution/manifest.js', mode: 0o644, data: dummyJs },
    { path: '.evcrate/registry.json', mode: 0o644, data: dummyJson },
    { path: '.evcrate/source/.claude/settings.json', mode: 0o644, data: dummyJson },
    { path: '.evcrate/scopes/global.json', mode: 0o644, data: dummyJson }
  ];


  const buildManifestData = Buffer.from(JSON.stringify({
    schema_version: 3,
    source_hashes: {}, adapter_hashes: {}, owners: {},
    validation: { complete: true, symlinks: 'rejected', target_registry: 'validated' },
    home_policy: {},
    output_hashes: {
      '.claude': crypto.createHash('sha256').update(dummyJson).digest('hex')
    }
  }, null, 2) + '\n');

  for (const target of ['all', 'antigravity', 'claude', 'codex', 'copilot', 'omp', 'pi', 'vscode']) {
    const path = target === 'all' ? '.evcrate/build-manifest.json' : `.evcrate/build-manifest-${target}.json`;
    records.push({ path, mode: 0o644, data: buildManifestData });
  }

  return records.map((r) => {
    const size = r.data.length;
    const sha256 = crypto.createHash('sha256').update(r.data).digest('hex');
    return { ...r, size, sha256 };
  });
}
