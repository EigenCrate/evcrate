/**
 * @file qualification-report-schema.mjs
 * Validates evidence needed for a real joint G4 acceptance.
 *
 * Shape validation is not evidence authentication. Reviewers must inspect and sign
 * the referenced immutable artifacts before accepting the gate.
 */

export const FROZEN_G0_BUDGETS = Object.freeze({
  refreshP95Ms: 10000,
  summaryPageP95Ms: 500,
  detailP95Ms: 1000,
  cancellationAckP95Ms: 250,
  cooperativeSettlementP95Ms: 1000,
  rttReferenceMs: 10,
  minRefreshSamples: 5,
  minInteractiveSamples: 20,
  minCancellationSamples: 20
});

export const REQUIRED_SCENARIOS = Object.freeze([
  'scenario-01-independent-lifecycle',
  'scenario-02-four-views-separate-lan',
  'scenario-03-target-isolation-current-policy',
  'scenario-04-reject-unauthorized-access',
  'scenario-05-iframe-sandboxing-isolation',
  'scenario-06-bounded-error-handling',
  'scenario-07-honest-metrics-diagnostics',
  'scenario-08-matched-pair-activation',
  'scenario-09-non-destructive-reads-lifecycle',
  'scenario-10-linux-deployment-safety',
  'scenario-11-parity-and-provenance-fixtures',
  'scenario-12-10k-performance-workload'
]);

const REQUIRED_SIGNOFF_ROLES = Object.freeze(['security', 'operations', 'product']);
const REQUIRED_SAMPLE_GROUPS = Object.freeze([
  'corpus',
  'refresh',
  'summary',
  'page',
  'detail',
  'cancellation',
  'settlement',
  'rtt',
  'resources'
]);

function nearestRank(values, percentile = 0.95) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(1, Math.ceil(percentile * sorted.length)) - 1];
}

function validEvidenceReference(reference) {
  return reference !== null &&
    typeof reference === 'object' &&
    typeof reference.uri === 'string' && reference.uri.length > 0 &&
    typeof reference.sha256 === 'string' && /^[0-9a-f]{64}$/.test(reference.sha256);
}

function validateSamples(bm, errors, name, p95Name, minimumCount, maximumP95) {
  const samples = bm[name];
  if (!Array.isArray(samples) || samples.length < minimumCount ||
      samples.some((value) => !Number.isFinite(value) || value < 0)) {
    errors.push(`benchmark10k.${name} must contain >= ${minimumCount} finite non-negative samples`);
    return;
  }

  const measuredP95 = nearestRank(samples);
  if (!Number.isFinite(bm[p95Name]) || Math.abs(bm[p95Name] - measuredP95) > 0.01) {
    errors.push(`benchmark10k.${p95Name} must equal nearest-rank p95 (${measuredP95} ms) from ${name}`);
  }
  if (measuredP95 > maximumP95) {
    errors.push(`benchmark10k.${p95Name} (${measuredP95} ms) exceeds G0 limit <= ${maximumP95} ms`);
  }
}

/**
 * Validate the structure and reported measurements for signed joint G4 evidence.
 * The caller still has to verify that referenced artifacts and signatures are real.
 * @param {object} report
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateQualificationReport(report) {
  const errors = [];
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    return { valid: false, errors: ['Report must be a non-null object'] };
  }

  const gate = report.gate;
  if (!gate || gate.status !== 'accepted') errors.push('G4 gate.status must be accepted');
  if (!gate || typeof gate.g0Revision !== 'string' || gate.g0Revision.length === 0) {
    errors.push('Missing signed G0 budget revision');
  }
  if (!gate || !Number.isFinite(Date.parse(gate.acceptedAt))) errors.push('Missing valid G4 acceptedAt timestamp');

  const signoffs = Array.isArray(gate?.signoffs) ? gate.signoffs : [];
  for (const role of REQUIRED_SIGNOFF_ROLES) {
    const signer = signoffs.find((entry) => entry?.role === role);
    if (!signer || typeof signer.reviewer !== 'string' || signer.reviewer.length === 0 ||
        !Number.isFinite(Date.parse(signer.signedAt)) ||
        typeof signer.evidenceUri !== 'string' || signer.evidenceUri.length === 0) {
      errors.push(`Missing signed ${role} G4 disposition and evidence reference`);
    }
  }

  const deployment = report.deployment;
  const requiredDeploymentFields = [
    'hostVersion', 'pluginVersion', 'artifactSha256', 'hostArtifactSha256',
    'linuxDistribution', 'kernelVersion', 'nodeVersion', 'browserVersion',
    'cpu', 'ramGb', 'deploymentIdentity', 'networkBoundary'
  ];
  if (!deployment || typeof deployment !== 'object') {
    errors.push('Missing deployment record object');
  } else {
    for (const field of requiredDeploymentFields) {
      if (typeof deployment[field] !== 'string' && typeof deployment[field] !== 'number') {
        errors.push(`Missing deployment.${field}`);
      }
    }
    for (const field of ['artifactSha256', 'hostArtifactSha256']) {
      if (!/^[0-9a-f]{64}$/.test(deployment[field] ?? '')) {
        errors.push(`deployment.${field} must be a 64-hex SHA-256`);
      }
    }
    if (typeof deployment.ramGb !== 'number' || deployment.ramGb <= 0) {
      errors.push('deployment.ramGb must be a positive number');
    }
  }

  const scenarios = Array.isArray(report.scenarios) ? report.scenarios : [];
  if (!Array.isArray(report.scenarios)) errors.push('Report.scenarios must be an array');
  const scenarioIds = new Set();
  for (const scenario of scenarios) {
    if (!scenario || typeof scenario.id !== 'string') {
      errors.push('Every scenario must have an id');
      continue;
    }
    if (scenarioIds.has(scenario.id)) errors.push(`Duplicate scenario: ${scenario.id}`);
    scenarioIds.add(scenario.id);
    if (scenario.status !== 'passed') errors.push(`Scenario ${scenario.id} is not passed`);
    if (!Array.isArray(scenario.evidence) || scenario.evidence.length === 0 ||
        scenario.evidence.some((reference) => !validEvidenceReference(reference))) {
      errors.push(`Scenario ${scenario.id} requires immutable evidence URI and SHA-256 references`);
    }
  }
  for (const id of REQUIRED_SCENARIOS) {
    if (!scenarioIds.has(id)) errors.push(`Missing required scenario: ${id}`);
  }

  const bm = report.benchmark10k;
  if (!bm || typeof bm !== 'object') {
    errors.push('Missing benchmark10k section');
  } else {
    if (bm.transport !== 'damhopper-api-worker-separate-lan') {
      errors.push('benchmark10k.transport must exercise the DamHopper API/worker from a separate LAN browser');
    }
    if (!/^[0-9a-f]{64}$/.test(bm.corpusDigest ?? '')) {
      errors.push('benchmark10k.corpusDigest must be a valid 64-hex SHA-256');
    }
    if (bm.totalConsultations !== 10000) errors.push('benchmark10k.totalConsultations must equal 10000');

    validateSamples(bm, errors, 'refreshSamples', 'refreshP95Ms',
      FROZEN_G0_BUDGETS.minRefreshSamples, FROZEN_G0_BUDGETS.refreshP95Ms);
    validateSamples(bm, errors, 'summarySamples', 'summaryP95Ms',
      FROZEN_G0_BUDGETS.minInteractiveSamples, FROZEN_G0_BUDGETS.summaryPageP95Ms);
    validateSamples(bm, errors, 'pageSamples', 'pageP95Ms',
      FROZEN_G0_BUDGETS.minInteractiveSamples, FROZEN_G0_BUDGETS.summaryPageP95Ms);
    validateSamples(bm, errors, 'detailSamples', 'detailP95Ms',
      FROZEN_G0_BUDGETS.minInteractiveSamples, FROZEN_G0_BUDGETS.detailP95Ms);
    validateSamples(bm, errors, 'cancellationAckSamples', 'cancellationAckP95Ms',
      FROZEN_G0_BUDGETS.minCancellationSamples, FROZEN_G0_BUDGETS.cancellationAckP95Ms);
    validateSamples(bm, errors, 'cooperativeSettlementSamples', 'cooperativeSettlementP95Ms',
      FROZEN_G0_BUDGETS.minCancellationSamples, FROZEN_G0_BUDGETS.cooperativeSettlementP95Ms);
    validateSamples(bm, errors, 'rttSamples', 'rttP95Ms',
      FROZEN_G0_BUDGETS.minInteractiveSamples, FROZEN_G0_BUDGETS.rttReferenceMs);

    const peakFields = [
      'apiRssMb', 'workerRssMb', 'snapshotBytes', 'bufferedFrameBytes',
      'frameSizeMaxBytes', 'cpuUserMs', 'cpuSystemMs', 'browserLongTaskCount'
    ];
    if (!bm.resourcePeaks || typeof bm.resourcePeaks !== 'object') {
      errors.push('Missing benchmark10k.resourcePeaks object');
    } else {
      for (const field of peakFields) {
        if (!Number.isFinite(bm.resourcePeaks[field]) || bm.resourcePeaks[field] < 0) {
          errors.push(`Missing finite benchmark10k.resourcePeaks.${field}`);
        }
      }
    }
    if (!bm.resourceBudgets || bm.resourceBudgets.g0Revision !== gate?.g0Revision) {
      errors.push('Resource ceilings must cite the accepted G0 budget revision');
    } else if (bm.resourcePeaks) {
      for (const field of ['apiRssMb', 'workerRssMb', 'snapshotBytes', 'bufferedFrameBytes', 'frameSizeMaxBytes']) {
        const ceiling = bm.resourceBudgets[field];
        if (!Number.isFinite(ceiling) || ceiling <= 0) {
          errors.push(`Missing positive benchmark10k.resourceBudgets.${field}`);
        } else if (Number.isFinite(bm.resourcePeaks[field]) && bm.resourcePeaks[field] > ceiling) {
          errors.push(`benchmark10k.resourcePeaks.${field} exceeds its signed G0 ceiling`);
        }
      }
    }

    const evidence = bm.rawEvidence;
    if (!evidence || REQUIRED_SAMPLE_GROUPS.some((group) => !validEvidenceReference(evidence[group]))) {
      errors.push('benchmark10k.rawEvidence must reference the corpus and every raw measurement group');
    }
  }

  return { valid: errors.length === 0, errors };
}
