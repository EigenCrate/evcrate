'use strict';

const packageMetadata = require('../../package.json');

const API_ORIGIN = 'https://api.github.com';
const MAX_RESPONSE_BYTES = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;

function canonicalRepository() {
  const match = /^git\+https:\/\/github\.com\/([\w-]+\/[\w.-]+)\.git$/.exec(packageMetadata.repository.url);
  if (!match) throw new Error('Canonical package repository must be a GitHub HTTPS repository');
  return match[1];
}

// The only injected boundary is fetch; neither the CLI nor environment can replace it or the issuer.
async function githubGet(endpoint, token, fetchFn) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchFn(`${API_ORIGIN}${endpoint}`, {
      method: 'GET',
      redirect: 'error',
      signal: controller.signal,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });
    if (response.status !== 200) {
      throw new Error(`GitHub approval verification GET ${endpoint} returned HTTP ${response.status}`);
    }
    // Never authorize from a partial response or silently omit later rejection records.
    if (/rel="next"/.test(response.headers.get('link') || '')) {
      throw new Error('GitHub approval verification requires a complete, unpaginated response');
    }
    if (Number(response.headers.get('content-length')) > MAX_RESPONSE_BYTES) {
      throw new Error('GitHub approval response exceeds size limit');
    }
    const chunks = [];
    let length = 0;
    for await (const chunk of response.body) {
      length += chunk.byteLength;
      if (length > MAX_RESPONSE_BYTES) throw new Error('GitHub approval response exceeds size limit');
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks, length).toString('utf8'));
  } finally {
    controller.abort();
    clearTimeout(timer);
  }
}

function validIdentity(user) {
  return user && Number.isSafeInteger(user.id) && user.id > 0 &&
    typeof user.login === 'string' && user.login.length > 0;
}

function sameRepository(repository, canonical) {
  return typeof repository === 'string' && repository.toLowerCase() === canonical.toLowerCase();
}

/** Verify the independent GitHub environment review for this already-verified candidate. */
async function verifyGitHubStableApproval(receipt, { env = process.env, fetchFn = fetch } = {}) {
  const repository = canonicalRepository();
  const root = `/repos/${repository}`;
  const token = env.GITHUB_TOKEN || env.GH_TOKEN;
  if (!token || typeof token !== 'string' || !token.trim()) {
    throw new Error('Stable release publication requires a GitHub token for live approval verification');
  }
  if (!sameRepository(receipt.repository, repository)) {
    throw new Error('Stable candidate repository does not match canonical repository');
  }
  if (!Number.isSafeInteger(receipt.workflow_run_id) || receipt.workflow_run_id <= 0 ||
      !Number.isSafeInteger(receipt.workflow_run_attempt) || receipt.workflow_run_attempt <= 0) {
    throw new Error('Stable candidate requires a valid workflow run and attempt');
  }
  // Review history has no attempt identifier or review timestamp. A rerun cannot prove freshness.
  if (receipt.workflow_run_attempt !== 1) {
    throw new Error('Stable approval cannot be bound to a rerun attempt; start a new workflow run');
  }
  const get = (endpoint) => githubGet(`${root}${endpoint}`, token, fetchFn);
  const run = await get(`/actions/runs/${receipt.workflow_run_id}`);
  if (run.id !== receipt.workflow_run_id || run.run_attempt !== receipt.workflow_run_attempt ||
      run.head_sha !== receipt.source_commit || run.head_branch !== 'main' ||
      run.path !== '.github/workflows/release.yml' ||
      !sameRepository(run.repository?.full_name, repository) ||
      !sameRepository(run.head_repository?.full_name, repository)) {
    throw new Error('GitHub workflow run does not match candidate run, attempt, commit, main branch, workflow, or repository');
  }
  if (!validIdentity(run.actor) || !validIdentity(run.triggering_actor)) {
    throw new Error('GitHub workflow run is missing actor identities');
  }

  const environment = await get('/environments/production');
  if (!Number.isSafeInteger(environment.id) || environment.id <= 0 || environment.name !== 'production' ||
      environment.can_admins_bypass !== false ||
      environment.deployment_branch_policy?.protected_branches !== false ||
      environment.deployment_branch_policy?.custom_branch_policies !== true ||
      !Array.isArray(environment.protection_rules)) {
    throw new Error('GitHub production environment must disable admin bypass and restrict selected branches');
  }
  const rules = environment.protection_rules;
  const reviewRules = rules.filter((rule) => rule?.type === 'required_reviewers');
  if (reviewRules.length !== 1 || rules.some((rule) => !['required_reviewers', 'branch_policy'].includes(rule?.type))) {
    throw new Error('GitHub production environment has missing or unsupported protection rules');
  }
  const reviewRule = reviewRules[0];
  if (reviewRule.prevent_self_review !== true || !Array.isArray(reviewRule.reviewers) ||
      reviewRule.reviewers.length === 0 || reviewRule.reviewers.some((entry) =>
        entry?.type !== 'User' || entry.reviewer?.type !== 'User' || !validIdentity(entry.reviewer))) {
    throw new Error('GitHub production environment requires User reviewers and prevent_self_review=true');
  }
  const branches = await get('/environments/production/deployment-branch-policies?per_page=100');
  const branchPolicy = Array.isArray(branches.branch_policies) ? branches.branch_policies[0] : null;
  if (branches.total_count !== 1 || !Array.isArray(branches.branch_policies) ||
      branches.branch_policies.length !== 1 || !Number.isSafeInteger(branchPolicy?.id) ||
      branchPolicy.id <= 0 || branchPolicy.name !== 'main' ||
      (branchPolicy.node_id !== undefined &&
        (typeof branchPolicy.node_id !== 'string' || branchPolicy.node_id.length === 0)) ||
      (branchPolicy.type !== undefined && branchPolicy.type !== 'branch')) {
    throw new Error('GitHub production environment must allow only the main branch');
  }

  const historyPath = `/actions/runs/${receipt.workflow_run_id}/approvals`;
  const history = await get(historyPath);
  if (!Array.isArray(history) || history.some((review) => !Array.isArray(review?.environments))) {
    throw new Error('GitHub workflow review history is malformed');
  }
  const reviews = history.filter((review) => review.environments.some((entry) =>
    entry?.id === environment.id || entry?.name === environment.name));
  if (reviews.length === 0 || reviews.some((review) => review.state !== 'approved' ||
      !review.environments.some((entry) => entry?.id === environment.id && entry?.name === environment.name) ||
      review.environments.some((entry) => (entry?.id === environment.id) !== (entry?.name === environment.name)))) {
    throw new Error('GitHub production review is absent, rejected, pending, or references a mismatched environment');
  }
  for (const review of reviews) {
    const reviewer = review.user;
    if (!validIdentity(reviewer) || reviewer.type !== 'User' ||
        !reviewRule.reviewers.some((entry) => entry.reviewer.id === reviewer.id) ||
        [run.actor, run.triggering_actor].some((actor) => actor.id === reviewer.id ||
          actor.login.toLowerCase() === reviewer.login.toLowerCase())) {
      throw new Error('GitHub approval reviewer must be a configured independent User, not the run actor');
    }
    const permission = await get(`/collaborators/${encodeURIComponent(reviewer.login)}/permission`);
    if (permission.user?.id !== reviewer.id || permission.user?.type !== 'User' ||
        permission.user?.login?.toLowerCase() !== reviewer.login.toLowerCase() ||
        !((permission.role_name === 'maintain' && permission.permission === 'write') ||
          (permission.role_name === 'admin' && permission.permission === 'admin'))) {
      throw new Error('GitHub approval reviewer must have maintain or admin collaborator permission');
    }
  }

  const reviewer = reviews[0].user;
  return {
    status: 'approved',
    source_api: `${API_ORIGIN}${root}${historyPath}`,
    repository,
    environment: { id: environment.id, name: environment.name },
    workflow_run_id: run.id,
    workflow_run_attempt: run.run_attempt,
    source_commit: run.head_sha,
    version: receipt.version,
    tag: receipt.tag,
    approved_by: reviewer.login,
    reviewer: { id: reviewer.id, login: reviewer.login, type: reviewer.type }
  };
}

module.exports = { verifyGitHubStableApproval };
