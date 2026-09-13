export function buildResourcesListArgs({ cursor = null, limit = null, kind = null } = {}) {
  const args = ['resources', 'list'];
  if (cursor) args.push('--cursor', cursor);
  if (limit) args.push('--limit', String(limit));
  if (kind) args.push('--kind', kind);
  return args;
}

export function buildResourcesGetArgs(id) {
  return ['resources', 'get', '--id', id];
}

export function buildScopesGetArgs(id) {
  return ['scopes', 'get', '--id', id];
}

export function buildScopesAssignArgs({ resourceId, target = null, approveCapabilities = [], expectedRevision = null }) {
  const args = ['scopes', 'assign', '--id', resourceId];
  if (target) args.push('--target', target);
  for (const cap of approveCapabilities) args.push('--approve-capability', cap);
  if (expectedRevision !== null) {
    const revStr = typeof expectedRevision === 'string' ? expectedRevision : JSON.stringify(expectedRevision);
    args.push('--expected-revision', revStr);
  }
  return args;
}

export function buildScopesMutationArgs(action, { resourceId, target = null, expectedRevision = null }) {
  const args = ['scopes', action, '--id', resourceId];
  if (target) args.push('--target', target);
  if (expectedRevision !== null) {
    const revStr = typeof expectedRevision === 'string' ? expectedRevision : JSON.stringify(expectedRevision);
    args.push('--expected-revision', revStr);
  }
  return args;
}

export function buildImportsPreviewArgs({ sourcePath, kind = null, destination = null, provenance = null, approveCapabilities = [], expirySeconds = null }) {
  const args = ['imports', 'preview'];
  if (sourcePath) args.push('--import-source', sourcePath);
  if (kind) args.push('--kind', kind);
  if (destination) args.push('--destination', destination);
  if (provenance) args.push('--provenance', provenance);
  for (const cap of approveCapabilities) args.push('--approve-capability', cap);
  if (expirySeconds !== null) args.push('--expiry', String(expirySeconds));
  return args;
}

export function buildImportsApplyArgs({ token }) {
  return ['imports', 'apply', '--preview-token', token];
}

export function buildChangesPreviewArgs({ mutation, expectedRevision, resourceId = null, expirySeconds = null, approveCapabilities = [] }) {
  const args = ['changes', 'preview', '--mutation', mutation];
  const revStr = typeof expectedRevision === 'string' ? expectedRevision : JSON.stringify(expectedRevision);
  args.push('--expected-revision', revStr);
  if (resourceId) args.push('--id', resourceId);
  for (const cap of approveCapabilities) args.push('--approve-capability', cap);
  if (expirySeconds !== null) args.push('--expiry', String(expirySeconds));
  return args;
}

export function buildChangesApplyArgs({ token }) {
  return ['changes', 'apply', '--preview-token', token];
}

export function buildPublishArgs(mode, { targets = null, scope = null } = {}) {
  const args = ['publish', mode === 'dry-run' ? '--dry-run' : '--apply'];
  if (targets) for (const target of targets) args.push('--target', target);
  if (scope !== null) args.push('--scope', scope);
  return args;
}

export function buildRecoverArgs({ targets = null, scope = null } = {}) {
  const args = ['recover'];
  if (targets) for (const target of targets) args.push('--target', target);
  if (scope !== null) args.push('--scope', scope);
  return args;
}
