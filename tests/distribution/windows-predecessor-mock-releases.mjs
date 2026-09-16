import {
  LABEL_WINDOWS_ARCHIVE,
  LABEL_WINDOWS_INSTALLER,
  LABEL_WINDOWS_SIDECAR,
  LABEL_RELEASE_METADATA
} from '../../scripts/release/predecessor-resolver-core.mjs';

export function makeMockAsset(name, label, options = {}) {
  return {
    id: options.id || Math.floor(Math.random() * 1000000),
    name,
    label,
    size: options.size || 1024,
    url: options.url || `https://api.github.com/repos/EigenCrate/evcrate/releases/assets/${options.id || 1}`,
    browser_download_url: options.downloadUrl || `https://github.com/EigenCrate/evcrate/releases/download/mock/${name}`
  };
}

export function makeMockRelease(version, options = {}) {
  const {
    draft = false,
    prerelease = false,
    qualified = false,
    deferred = false,
    missingAsset = null,
    duplicateLabel = false
  } = options;

  const zipName = `evcrate-v${version}-windows-x64.zip`;
  const sidecarName = `${zipName}.sha256`;
  const metaName = `evcrate-v${version}.release.json`;
  const ps1Name = 'install.ps1';

  let zipLabel = null;
  let ps1Label = null;

  if (qualified) {
    zipLabel = LABEL_WINDOWS_ARCHIVE;
    ps1Label = LABEL_WINDOWS_INSTALLER;
  } else if (deferred) {
    zipLabel = 'Windows x64 Archive (Validation Deferred)';
    ps1Label = 'Windows Installer Entrypoint (install.ps1 - Validation Deferred)';
  }

  const assets = [];
  if (missingAsset !== 'zip') assets.push(makeMockAsset(zipName, zipLabel, { id: 101 }));
  if (missingAsset !== 'sidecar') assets.push(makeMockAsset(sidecarName, LABEL_WINDOWS_SIDECAR, { id: 102 }));
  if (missingAsset !== 'metadata') assets.push(makeMockAsset(metaName, LABEL_RELEASE_METADATA, { id: 103 }));
  if (missingAsset !== 'installer') assets.push(makeMockAsset(ps1Name, ps1Label, { id: 104 }));

  if (duplicateLabel) {
    assets.push(makeMockAsset('extra-archive.zip', LABEL_WINDOWS_ARCHIVE, { id: 105 }));
  }

  return {
    id: options.id || Math.floor(Math.random() * 1000000),
    tag_name: `v${version}`,
    target_commitish: options.commit || 'f'.repeat(40),
    draft,
    prerelease,
    published_at: options.publishedAt || '2026-01-01T00:00:00Z',
    assets
  };
}
