import semver from 'semver';

export const LABEL_WINDOWS_ARCHIVE = 'Windows x64 Archive';
export const LABEL_WINDOWS_INSTALLER = 'Windows Installer Entrypoint (install.ps1)';
export const LABEL_WINDOWS_SIDECAR = 'Windows x64 SHA-256 Sidecar';
export const LABEL_RELEASE_METADATA = 'Release Metadata';

export const BOOTSTRAP_VERSION = '1.0.0';
export const BOOTSTRAP_TAG = 'v1.0.0';
export const BOOTSTRAP_COMMIT = 'a'.repeat(40);
export const BOOTSTRAP_KIND = 'bootstrap-fixture';
export const QUALIFIED_KIND = 'qualified-release';

export async function fetchAllReleases(options = {}) {
  const { repository, githubToken = null, apiUrl = 'https://api.github.com', fetchFn = fetch, maxPages = 10 } = options;

  if (!repository || !repository.includes('/')) {
    throw new Error(`Invalid repository format: "${repository}" (expected "owner/repo")`);
  }

  const allReleases = [];
  const headers = { 'User-Agent': 'evcrate-predecessor-resolver', 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  if (githubToken) {
    headers['Authorization'] = `Bearer ${githubToken}`;
  }

  for (let page = 1; page <= maxPages; page += 1) {
    const url = `${apiUrl.replace(/\/+$/u, '')}/repos/${repository}/releases?per_page=100&page=${page}`;
    let res;
    try {
      res = await fetchFn(url, { method: 'GET', headers });
    } catch (err) {
      throw new Error(`Network failure querying GitHub releases API: ${err.message}`);
    }

    if (!res.ok) {
      const body = (await res.text().catch(() => '')).slice(0, 1024);
      throw new Error(`GitHub API error fetching releases from ${url} (HTTP ${res.status}): ${body}`);
    }

    const pageReleases = await res.json();
    if (!Array.isArray(pageReleases) || pageReleases.length === 0) {
      break;
    }
    allReleases.push(...pageReleases);
    if (pageReleases.length < 100) {
      break;
    }
  }

  return allReleases;
}
export function inspectReleaseQualification(release) {

  const assets = Array.isArray(release.assets) ? release.assets : [];
  const archiveMatches = assets.filter((a) => a.label === LABEL_WINDOWS_ARCHIVE);
  const installerMatches = assets.filter((a) => a.label === LABEL_WINDOWS_INSTALLER);

  if (archiveMatches.length > 1) {
    throw new Error(
      `Duplicate asset label "${LABEL_WINDOWS_ARCHIVE}" found on release ${release.tag_name || release.id}`
    );
  }
  if (installerMatches.length > 1) {
    throw new Error(
      `Duplicate asset label "${LABEL_WINDOWS_INSTALLER}" found on release ${release.tag_name || release.id}`
    );
  }

  const isQualified = archiveMatches.length === 1 && installerMatches.length === 1;
  return {
    isQualified,
    archiveAsset: archiveMatches[0] || null,
    installerAsset: installerMatches[0] || null
  };
}

export function filterStableReleases(rawReleases) {
  if (!Array.isArray(rawReleases)) return [];
  const stable = [];

  for (const r of rawReleases) {
    if (!r || typeof r !== 'object') continue;
    if (r.draft === true) continue;
    if (r.prerelease === true) continue;

    const tag = r.tag_name;
    if (typeof tag !== 'string' || !tag.startsWith('v')) continue;
    const ver = tag.slice(1);
    if (!semver.valid(ver) || semver.prerelease(ver)) continue;

    const qual = inspectReleaseQualification(r);
    stable.push({
      ...r,
      version: ver,
      isQualified: qual.isQualified,
      archiveAsset: qual.archiveAsset,
      installerAsset: qual.installerAsset
    });
  }

  return stable;
}

export function resolvePredecessorPlan(options = {}) {
  const { releases = [], candidateVersion } = options;
  if (!candidateVersion || typeof candidateVersion !== 'string' || !semver.valid(candidateVersion)) {
    throw new Error(`Invalid candidate version: "${candidateVersion}"`);
  }

  const cleanCandidate = semver.clean(candidateVersion);
  const stableReleases = filterStableReleases(releases);
  const hasQualifiedHistory = stableReleases.some((r) => r.isQualified);

  if (!hasQualifiedHistory) {
    if (!semver.gt(cleanCandidate, BOOTSTRAP_VERSION)) {
      throw new Error(
        `Candidate version "${cleanCandidate}" must be greater than bootstrap version "${BOOTSTRAP_VERSION}"`
      );
    }
    return {
      mode: 'bootstrap',
      candidateVersion: cleanCandidate,
      bootstrap: {
        kind: BOOTSTRAP_KIND,
        version: BOOTSTRAP_VERSION,
        tag: BOOTSTRAP_TAG,
        sourceCommit: BOOTSTRAP_COMMIT
      }
    };
  }

  // Once any qualified release exists, latest stable must qualify (fail-closed)
  stableReleases.sort((a, b) => semver.rcompare(a.version, b.version));
  const latestStable = stableReleases[0];

  if (!latestStable.isQualified) {
    throw new Error(
      `Latest stable release "${latestStable.tag_name}" is not qualified with required Windows qualification labels ("${LABEL_WINDOWS_ARCHIVE}" and "${LABEL_WINDOWS_INSTALLER}"). Fail-closed: once qualification history exists, latest stable must qualify.`
    );
  }

  if (!semver.gt(cleanCandidate, latestStable.version)) {
    throw new Error(
      `Candidate version "${cleanCandidate}" must be greater than predecessor version "${latestStable.version}"`
    );
  }

  // Resolve and validate the exact 4 assets on latestStable
  const assets = latestStable.assets || [];
  const expectedZipName = `evcrate-v${latestStable.version}-windows-x64.zip`;
  const expectedSidecarName = `${expectedZipName}.sha256`;
  const expectedMetaName = `evcrate-v${latestStable.version}.release.json`;
  const expectedPs1Name = 'install.ps1';

  const zipAssets = assets.filter((a) => a.label === LABEL_WINDOWS_ARCHIVE || a.name === expectedZipName);
  if (zipAssets.length === 0) throw new Error(`Missing Windows ZIP archive asset on ${latestStable.tag_name}`);
  if (zipAssets.length > 1) throw new Error(`Duplicate Windows ZIP archive asset on ${latestStable.tag_name}`);
  const zip = zipAssets[0];
  if (zip.name !== expectedZipName) {
    throw new Error(`Windows ZIP archive asset has invalid name "${zip.name}", expected "${expectedZipName}"`);
  }

  const ps1Assets = assets.filter((a) => a.label === LABEL_WINDOWS_INSTALLER || a.name === expectedPs1Name);
  if (ps1Assets.length === 0) throw new Error(`Missing install.ps1 asset on ${latestStable.tag_name}`);
  if (ps1Assets.length > 1) throw new Error(`Duplicate install.ps1 asset on ${latestStable.tag_name}`);
  const ps1 = ps1Assets[0];
  if (ps1.name !== expectedPs1Name) {
    throw new Error(`Windows installer asset has invalid name "${ps1.name}", expected "${expectedPs1Name}"`);
  }

  const sidecarAssets = assets.filter((a) => a.name === expectedSidecarName || a.label === LABEL_WINDOWS_SIDECAR);
  if (sidecarAssets.length === 0) throw new Error(`Missing sidecar asset "${expectedSidecarName}" on ${latestStable.tag_name}`);
  if (sidecarAssets.length > 1) throw new Error(`Duplicate sidecar asset on ${latestStable.tag_name}`);
  const sidecar = sidecarAssets[0];

  const metaAssets = assets.filter((a) => a.name === expectedMetaName || a.label === LABEL_RELEASE_METADATA);
  if (metaAssets.length === 0) throw new Error(`Missing release metadata asset "${expectedMetaName}" on ${latestStable.tag_name}`);
  if (metaAssets.length > 1) throw new Error(`Duplicate release metadata asset on ${latestStable.tag_name}`);
  const metadata = metaAssets[0];

  return {
    mode: 'qualified',
    candidateVersion: cleanCandidate,
    release: latestStable,
    assets: {
      zip: { id: zip.id, name: expectedZipName, asset: zip },
      sidecar: { id: sidecar.id, name: expectedSidecarName, asset: sidecar },
      metadata: { id: metadata.id, name: expectedMetaName, asset: metadata },
      installer: { id: ps1.id, name: expectedPs1Name, asset: ps1 }
    }
  };
}
