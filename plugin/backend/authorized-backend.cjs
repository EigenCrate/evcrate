'use strict';

const fs = require('node:fs');
const path = require('node:path');

function resolveAdvisorModule(relPath) {
  // 1. Check local bundled advisor-lib/ inside plugin package
  const localPath = path.join(__dirname, 'advisor-lib', relPath);
  if (fs.existsSync(localPath)) return localPath;

  // 2. Check in-repo source path
  const repoPath = path.join(__dirname, '..', '..', '.evcrate', 'source', '.evcrate', 'bin', 'lib', 'advisor', relPath);
  if (fs.existsSync(repoPath)) return repoPath;

  // 3. Check authorized backend root path
  const authorizedRoot = path.join('/home/loidinh/WS/evcrate', '.evcrate', 'source', '.evcrate', 'bin', 'lib', 'advisor', relPath);
  if (fs.existsSync(authorizedRoot)) return authorizedRoot;

  return localPath;
}

function resolveProtocolModule(relPath) {
  // 1. Check local bundled protocol-lib/ inside plugin package
  const localPath = path.join(__dirname, 'protocol-lib', relPath);
  if (fs.existsSync(localPath)) return localPath;

  // 2. Check in-repo dist/protocol path
  const repoPath = path.join(__dirname, '..', '..', 'dist', 'protocol', relPath);
  if (fs.existsSync(repoPath)) return repoPath;

  // 3. Check authorized backend root path
  const authorizedRoot = path.join('/home/loidinh/WS/evcrate', 'dist', 'protocol', relPath);
  if (fs.existsSync(authorizedRoot)) return authorizedRoot;

  return localPath;
}

module.exports = {
  resolveAdvisorModule,
  resolveProtocolModule,
};
