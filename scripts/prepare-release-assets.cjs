#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Generate metadata.json aligned with the package version and
 * bundle the release archive ahead of the semantic-release publish step.
 */
(function main() {
  const version = process.argv[2];

  if (!version) {
    console.error('✗ Missing required version argument for prepare-release-assets');
    process.exit(1);
  }

  const projectRoot = process.cwd();
  const packageJsonPath = path.join(projectRoot, 'package.json');
  const claudeDir = path.join(projectRoot, '.claude');
  const metadataPath = path.join(claudeDir, 'metadata.json');
  const distDir = path.join(projectRoot, 'dist');
  const archivePath = path.join(distDir, 'devkit.zip');

  try {
    if (!fs.existsSync(packageJsonPath)) {
      throw new Error('package.json not found');
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

    if (packageJson.version !== version) {
      console.warn(
        `⚠️ package.json version (${packageJson.version}) does not match semantic-release version (${version}).`
      );
    }

    const requiredFields = ['name', 'description', 'repository'];
    const missingFields = requiredFields.filter((field) => !packageJson[field]);

    if (missingFields.length > 0) {
      throw new Error(`Missing required fields in package.json: ${missingFields.join(', ')}`);
    }

    if (!fs.existsSync(claudeDir)) {
      fs.mkdirSync(claudeDir, { recursive: true });
    }

    const metadata = {
      version: packageJson.version,
      name: packageJson.name,
      description: packageJson.description,
      buildDate: new Date().toISOString(),
      repository: packageJson.repository,
      download: {
        lastDownloadedAt: null,
        downloadedBy: null,
        installCount: 0,
      },
    };

    fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
    console.log(`✓ Generated metadata.json with version ${metadata.version}`);

    if (!fs.existsSync(distDir)) {
      fs.mkdirSync(distDir, { recursive: true });
    }

    if (fs.existsSync(archivePath)) {
      fs.unlinkSync(archivePath);
    }

    console.log('🔄 Running project migrations to update Gemini & Codex configs...');
    try {
      execSync('python3 migrate_claude_to_gemini.py', { stdio: 'inherit' });
      console.log('✓ Project migrated to Gemini');
    } catch (e) {
      console.warn('⚠️ Warning: migrate_claude_to_gemini.py failed, using existing .gemini folder if present');
    }
    
    try {
      execSync('python3 migrate_claude_to_codex.py', {
        stdio: 'inherit',
        env: {
          ...process.env,
          CODEX_OUTPUT_DIR: path.join(projectRoot, '.codex'),
          AGENTS_OUTPUT_DIR: path.join(projectRoot, '.agents')
        }
      });
      console.log('✓ Project migrated to Codex');
    } catch (e) {
      console.warn('⚠️ Warning: migrate_claude_to_codex.py failed, using existing .codex/.agents folders if present');
    }

    const archiveTargets = [
      '.claude',
      '.gemini',
      '.codex',
      '.agents',
      '.opencode',
      'plans',
      '.gitignore',
      '.repomixignore',
      '.mcp.json',
      'CLAUDE.md',
      'distribute.sh',
      'distribute.py',
      'distribute_utils.py',
      'distribute_sync.py',
      'distribute_hooks.py',
      'migrate_claude_to_gemini.py',
      'migrate_claude_to_codex.py'
    ];

    const existingTargets = archiveTargets.filter((target) => fs.existsSync(path.join(projectRoot, target)));

    if (existingTargets.length === 0) {
      throw new Error('No release assets found to include in archive.');
    }

    const zipCommand = ['zip', '-r', archivePath, ...existingTargets].join(' ');
    execSync(zipCommand, { stdio: 'inherit' });
    console.log(`✓ Prepared ${archivePath}`);
  } catch (error) {
    console.error(`✗ Failed to prepare release assets: ${error.message}`);
    process.exit(1);
  }
})();
