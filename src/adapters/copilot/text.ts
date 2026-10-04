import { renderAdvisoryInterviewWorkflow, renderInlineAdviseCommand, renderMentoringWorkflow } from '../advisory.js';
import { restoreIndexedTokens } from '../uri-restoration.js';
const URI = /(?:[A-Za-z][A-Za-z0-9+.-]*:|\/\/)[^\s<>"']+/gu;

export function renderHarness(value: string): string {
  const saved: string[] = [];
  let rendered = value.replace(URI, (url) => { const token = `__EVCRATE_HARNESS_URL_${saved.length}__`; saved.push(url); return token; });
  for (const prefix of ['~', '$HOME', '${HOME}']) {
    for (const suffix of ['workflows', 'scripts', 'hooks', 'output-styles', 'skills']) {
      const target = suffix === 'skills' ? `${prefix}/.copilot/skills` : `${prefix}/.copilot/evcrate/${suffix}`;
      rendered = rendered.replaceAll(`${prefix}/.claude/${suffix}`, target);
    }
    rendered = rendered.replaceAll(`${prefix}/.claude`, `${prefix}/.copilot`);
  }
  for (const suffix of ['workflows', 'scripts', 'hooks', 'output-styles', 'skills']) {
    const target = suffix === 'skills' ? '.copilot/skills' : `.copilot/evcrate/${suffix}`;
    rendered = rendered.replaceAll(`.claude/${suffix}`, target);
  }
  rendered = rendered.replace(/(?<![A-Za-z0-9_])\.claude(?=(?:[/\\'"`\)\]\}]|\s|$))/gu, '.copilot');
  return restoreIndexedTokens(rendered, '__EVCRATE_HARNESS_URL_', saved);
}
export function advisoryCommand(body: string): string {
  return renderInlineAdviseCommand(body, 'copilot', 'Copilot user-input flow');
}

export function advisoryWorkflow(body: string): string {
  return renderAdvisoryInterviewWorkflow(body, 'copilot');
}
export function mentoringWorkflow(body: string): string {
  return renderMentoringWorkflow(body, 'copilot');
}

