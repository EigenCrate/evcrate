import crypto from 'node:crypto';
import { ADVISOR_CONTROLLER_FILES } from '../../../dist/index.js';

export function createMinimalValidRecords(version = '1.0.0') {
  const pkgJson = Buffer.from(JSON.stringify({
    name: 'evcrate',
    version,
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

  const advisorEntry = Buffer.from('#!/usr/bin/env node\nconsole.log("evcrate-advisor");\n');
  const dummyJs = Buffer.from('"use strict";\nmodule.exports = {};\n');
  const dummyJson = Buffer.from('{}\n');

  const records = [
    { path: 'package.json', mode: 0o644, data: pkgJson },
    { path: 'dist/cli/evcrate.js', mode: 0o755, data: cliScript },
    { path: 'dist/index.js', mode: 0o644, data: dummyJs },
    { path: 'dist/distribution/manifest.js', mode: 0o644, data: dummyJs },
    { path: 'dist/manifests/controller.js', mode: 0o644, data: dummyJs },
    { path: '.evcrate/registry.json', mode: 0o644, data: dummyJson },
    { path: '.evcrate/source/.claude/settings.json', mode: 0o644, data: dummyJson },
    { path: '.evcrate/scopes/global.json', mode: 0o644, data: dummyJson }
  ];

  for (const file of ADVISOR_CONTROLLER_FILES) {
    const isExecutable = file === 'evcrate-advisor';
    records.push({
      path: `.evcrate/source/.evcrate/bin/${file}`,
      mode: isExecutable ? 0o755 : 0o644,
      data: isExecutable ? advisorEntry : dummyJs
    });
  }

  const buildManifestData = Buffer.from(JSON.stringify({
    schema: 'evcrate-build-manifest/v2',
    generator: 'test',
    target: 'all',
    build_timestamp: new Date().toISOString(),
    output_hashes: {
      '.claude': crypto.createHash('sha256').update(dummyJson).digest('hex')
    },
    controller_hashes: {
      '.evcrate/bin/evcrate-advisor': crypto.createHash('sha256').update(advisorEntry).digest('hex')
    }
  }, null, 2) + '\n');

  records.push({ path: '.evcrate/build-manifest.json', mode: 0o644, data: buildManifestData });

  return records.map((r) => {
    const size = r.data.length;
    const sha256 = crypto.createHash('sha256').update(r.data).digest('hex');
    return { ...r, size, sha256 };
  });
}
