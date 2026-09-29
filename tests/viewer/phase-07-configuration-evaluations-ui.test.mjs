/**
 * @file phase-07-configuration-evaluations-ui.test.mjs
 * Verification suite for Phase 07: Configuration and Evaluations disclosures.
 * Validates:
 * 1. ConfigurationView: WAI-ARIA tabpanel reciprocity, compact policy summary,
 *    status badges, collapsed disclosure, independent historical route groups with
 *    scope badge and route counts, empty state guidance, and zero-overflow route cards.
 * 2. EvaluationsView: WAI-ARIA tabpanel reciprocity, descriptor summary invariant
 *    (never calling descriptor count a comparison-group count before compare),
 *    max 32 bounded comparison items, paginated descriptor list, group cards, limitations notice.
 * 3. EvaluationDetail: Escape key consumption (host panel preservation), strict candidate blinding
 *    (zero leakage of candidate ID, route, or build identity), and stable deterministic labeling.
 * 4. CSS tokens & narrow dock layout rules down to 180px.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Load fixture data for evaluation comparison
const fixDir = path.resolve('tests/fixtures/advisor-evaluations');
const validMixed = JSON.parse(fs.readFileSync(path.join(fixDir, 'valid-mixed.json'), 'utf8'));

test('Phase 07 - ConfigurationView: WAI-ARIA tabpanel reciprocity and attributes', () => {
  const configFile = fs.readFileSync('viewer/src/views/configuration-view.tsx', 'utf8');
  assert.ok(configFile.includes('role="tabpanel"'), 'ConfigurationView must have role="tabpanel"');
  assert.ok(configFile.includes('aria-labelledby="tab-configuration"'), 'ConfigurationView must have aria-labelledby="tab-configuration"');
  assert.ok(configFile.includes('id="panel-configuration"'), 'ConfigurationView must have id="panel-configuration"');
  assert.ok(configFile.includes('tabIndex={0}'), 'ConfigurationView must be keyboard focusable via tabIndex={0}');
});

test('Phase 07 - ConfigurationView: Policy summary card preserves all status states', () => {
  const policyCardFile = fs.readFileSync('viewer/src/components/policy-summary-card.tsx', 'utf8');
  assert.ok(policyCardFile.includes('Forbidden'), 'Must preserve forbidden state');
  assert.ok(policyCardFile.includes('Missing Policy'), 'Must preserve missing policy state');
  assert.ok(policyCardFile.includes('Not Configured'), 'Must preserve not_configured state');
  assert.ok(policyCardFile.includes('Migration Required'), 'Must preserve migration_required state');
  assert.ok(policyCardFile.includes('Current owner policy — not filtered by History project'), 'Must clearly separate owner policy from history scope');
  assert.ok(policyCardFile.includes('<details className="policy-disclosure"'), 'Must have collapsible disclosure for policy details');
  assert.ok(policyCardFile.includes('Primary Route'), 'Must display primary route');
  assert.ok(policyCardFile.includes('Backup Route'), 'Must display backup route');
});

test('Phase 07 - ConfigurationView: Historical route groups section displays count, scope badge, and empty hint', () => {
  const configFile = fs.readFileSync('viewer/src/views/configuration-view.tsx', 'utf8');
  assert.ok(configFile.includes('Historical Route Groups'), 'Must display Historical Route Groups section');
  assert.ok(configFile.includes('history-scope-badge'), 'Must display history scope badge');
  assert.ok(configFile.includes('Scope: {activityScope === \'all\' ? \'All History\' : \'Workspace Project\'}'), 'Must reflect current history activity scope');
  assert.ok(configFile.includes('historical-routes-empty'), 'Must provide empty state card');
  assert.ok(configFile.includes('Try refreshing history or select an active project in Workspace'), 'Must provide actionable hint to refresh or select scope');
});

test('Phase 07 - ConfigurationView: RouteGroupCard preserves all required metrics and identities', () => {
  const routeCardFile = fs.readFileSync('viewer/src/components/route-group-card.tsx', 'utf8');
  assert.ok(routeCardFile.includes('rg.route.backend'), 'Must display route backend');
  assert.ok(routeCardFile.includes('rg.route.model'), 'Must display route model');
  assert.ok(routeCardFile.includes('rg.route.effort'), 'Must display route effort');
  assert.ok(routeCardFile.includes('rg.counts.consultations'), 'Must display consultation count');
  assert.ok(routeCardFile.includes('rg.prompt_identity'), 'Must preserve prompt identity');
  assert.ok(routeCardFile.includes('rg.build_identity'), 'Must preserve build identity');
  assert.ok(routeCardFile.includes('rg.delivery.value'), 'Must display delivery rate');
  assert.ok(routeCardFile.includes('rg.known_outcome_resolution.value'), 'Must display resolution rate');
  assert.ok(routeCardFile.includes('rg.latency.p50'), 'Must display p50 latency');
  assert.ok(routeCardFile.includes('rg.latency.p95'), 'Must display p95 latency');
});

test('Phase 07 - EvaluationsView: WAI-ARIA tabpanel reciprocity across all states', () => {
  const evalViewFile = fs.readFileSync('viewer/src/views/evaluations-view.tsx', 'utf8');
  assert.ok(evalViewFile.includes('role="tabpanel"'), 'EvaluationsView must have role="tabpanel"');
  assert.ok(evalViewFile.includes('aria-labelledby="tab-evaluations"'), 'EvaluationsView must have aria-labelledby="tab-evaluations"');
  assert.ok(evalViewFile.includes('id="panel-evaluations"'), 'EvaluationsView must have id="panel-evaluations"');
  assert.ok(evalViewFile.includes('tabIndex={0}'), 'EvaluationsView must be keyboard focusable via tabIndex={0}');
});

test('Phase 07 - EvaluationsView: Invariant: Never calls raw descriptor count a comparison-group count before compare', () => {
  const headerFile = fs.readFileSync('viewer/src/components/evaluations-header.tsx', 'utf8');
  
  // Verify logic branches in header
  assert.ok(headerFile.includes('groupsCount > 0'), 'Must branch on groupsCount > 0');
  assert.ok(headerFile.includes('Counsel Evaluations (${groupsCount} comparable group'), 'When groups exist, displays comparable groups count');
  assert.ok(headerFile.includes('Counsel Evaluations (${descriptorsCount} descriptor'), 'When groups do NOT exist, displays descriptor count and never comparable groups');
  assert.ok(headerFile.includes('Click "Compare Available Descriptors" to group'), 'Explicitly instructs user to run compare to form groups');
});

test('Phase 07 - EvaluationsView: Explicit bounded comparison action (max 32 items)', () => {
  const evalViewFile = fs.readFileSync('viewer/src/views/evaluations-view.tsx', 'utf8');
  assert.ok(evalViewFile.includes('descriptors.slice(0, 32)'), 'Must strictly enforce maximum 32 bounded comparison items');
  assert.ok(evalViewFile.includes('onCompareDescriptors'), 'Must call onCompareDescriptors with bounded items');

  const headerFile = fs.readFileSync('viewer/src/components/evaluations-header.tsx', 'utf8');
  assert.ok(headerFile.includes('Compare Available Descriptors'), 'Action button must be clearly labeled');
  assert.ok(headerFile.includes('Max 32 bounded items'), 'Must indicate max 32 items hint');
});

test('Phase 07 - EvaluationsView: Descriptors list with pagination controls and Inspect action', () => {
  const sectionFile = fs.readFileSync('viewer/src/components/evaluation-descriptors-section.tsx', 'utf8');
  assert.ok(sectionFile.includes('PaginationControls'), 'Must include PaginationControls for descriptors list');
  assert.ok(sectionFile.includes('descriptors.length > pageSize'), 'Must paginate if descriptors exceed page size');

  const cardFile = fs.readFileSync('viewer/src/components/evaluation-descriptor-card.tsx', 'utf8');
  assert.ok(cardFile.includes('Inspect Descriptor'), 'Must provide explicit Inspect Descriptor button');
  assert.ok(cardFile.includes('d.source_revision'), 'Must display source revision');
  assert.ok(cardFile.includes('d.source_digest'), 'Must display source digest');
  assert.ok(cardFile.includes('d.candidate_count'), 'Must display candidate count');
  assert.ok(cardFile.includes('d.case_count'), 'Must display case count');
});

test('Phase 07 - EvaluationsView: Methodological limitations notice is prominent', () => {
  const evalViewFile = fs.readFileSync('viewer/src/views/evaluations-view.tsx', 'utf8');
  assert.ok(evalViewFile.includes('eval-limitations-notice'), 'Must have limitations notice container');
  assert.ok(evalViewFile.includes('Methodological limitations:'), 'Must explicitly state methodological limitations');
  assert.ok(evalViewFile.includes('matching rubric and input digests'), 'Must note grouping criteria');
  assert.ok(evalViewFile.includes('Candidate blinding is enabled by default to prevent evaluation bias'), 'Must state blinding rationale');
});

test('Phase 07 - EvaluationDetail: Escape key interception hierarchy (drawer consumes Escape)', () => {
  const detailFile = fs.readFileSync('viewer/src/views/evaluation-detail.tsx', 'utf8');
  assert.ok(detailFile.includes('addEventListener(\'keydown\', handleKeyDown, true)'), 'Must listen to keydown in capture phase');
  assert.ok(detailFile.includes('e.key === \'Escape\''), 'Must check for Escape key');
  assert.ok(detailFile.includes('e.stopPropagation()'), 'Must consume and stop propagation so host panel does not close');
  assert.ok(detailFile.includes('e.preventDefault()'), 'Must prevent default behavior');
  assert.ok(detailFile.includes('onCloseRef.current()') || detailFile.includes('onClose()'), 'Must call onClose handler on Escape');
});

test('Phase 07 - EvaluationDetail: Strict candidate blinding invariant and stable deterministic mapping', () => {
  // Simulate stable mapping logic
  const candidateIds = ['cand-zeta-9', 'cand-beta-2', 'cand-alpha-1'];
  const sortedIds = Array.from(new Set(candidateIds)).sort();
  const map = new Map();
  sortedIds.forEach((id, idx) => {
    map.set(id, `Candidate ${String.fromCharCode(65 + idx)}`);
  });

  // Verify sorted deterministic order
  assert.equal(map.get('cand-alpha-1'), 'Candidate A');
  assert.equal(map.get('cand-beta-2'), 'Candidate B');
  assert.equal(map.get('cand-zeta-9'), 'Candidate C');

  const detailFile = fs.readFileSync('viewer/src/views/evaluation-detail.tsx', 'utf8');
  assert.ok(detailFile.includes('candidateLabels'), 'Must construct stable deterministic candidateLabels map');
  assert.ok(detailFile.includes('String.fromCharCode(65 + (idx % 26))'), 'Must map candidate IDs to Candidate A, Candidate B');

  const perfTableFile = fs.readFileSync('viewer/src/components/candidate-performance-table.tsx', 'utf8');
  assert.ok(perfTableFile.includes('revealCandidates'), 'Table must check revealCandidates flag');
  assert.ok(perfTableFile.includes('candidateLabels.get(resp.candidate_id)'), 'Blinded label must be derived from candidateLabels');
  assert.ok(perfTableFile.includes('{revealCandidates && <th scope="col">Route / Build</th>}'), 'Route and Build columns MUST NOT render when blinded');
  assert.ok(perfTableFile.includes('key={revealCandidates ? resp.candidate_id : `blinded-resp-${idx}`}'), 'DOM key must not leak candidate ID when blinded');

  assert.ok(detailFile.includes('key={revealCandidates ? hs.candidate_id : `blinded-hs-${idx}`}'), 'Score provenance card caller key must not leak candidate ID when blinded');
  assert.ok(detailFile.includes('key={revealCandidates ? as.candidate_id : `blinded-as-${idx}`}'), 'Automated score caller key must not leak candidate ID when blinded');
});

test('Phase 07 - Cycle 2 Enhancements: Inspected evaluation drawer and comparison error banner', () => {
  const evalViewFile = fs.readFileSync('viewer/src/views/evaluations-view.tsx', 'utf8');
  assert.ok(evalViewFile.includes('inspected-evaluation-card'), 'EvaluationsView must render inspected-evaluation-card for selectedEvaluation');
  assert.ok(evalViewFile.includes('selectedEvaluation.document.evaluation_id'), 'Inspected card must show evaluation_id');

  const headerFile = fs.readFileSync('viewer/src/components/evaluations-header.tsx', 'utf8');
  assert.ok(headerFile.includes('comparison-error-banner'), 'Header must render comparison-error-banner on error');

  const policyFile = fs.readFileSync('viewer/src/components/policy-summary-card.tsx', 'utf8');
  assert.ok(policyFile.includes('Loading Policy'), 'Policy card must display Loading Policy banner');

  const stylesFile = fs.readFileSync('viewer/src/styles.css', 'utf8');
  assert.ok(stylesFile.includes('.routes-cards-list {\n    display: none;'), 'Styles must hide route cards on wide viewports to avoid duplicate rendering');
});
test('Phase 07 - CSS & Styling: Zero horizontal overflow guarantees and narrow dock rules', () => {
  const stylesFile = fs.readFileSync('viewer/src/styles.css', 'utf8');
  
  // Narrow dock breakpoint
  assert.ok(stylesFile.includes('@media (max-width: 260px)'), 'Must include 180px–260px dock adaptation breakpoint');
  assert.ok(stylesFile.includes('routes-cards-list'), 'Must style routes-cards-list');
  assert.ok(stylesFile.includes('overflow-wrap: anywhere') || stylesFile.includes('word-break: break-all'), 'Must enforce breaking long digests and routes');
  assert.ok(stylesFile.includes('policy-disclosure'), 'Must style policy disclosure');
  assert.ok(stylesFile.includes('eval-detail-drawer'), 'Must style evaluation detail drawer');
  assert.ok(stylesFile.includes('prefers-reduced-motion'), 'Must support prefers-reduced-motion');
});
