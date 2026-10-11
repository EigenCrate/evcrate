import { ControlPlaneError } from '../errors/control-plane-error.js';

const START = '<!-- EVCRATE_ADVISORY_CAPABILITIES_START -->';
const END = '<!-- EVCRATE_ADVISORY_CAPABILITIES_END -->';
const INLINE = '<!-- EVCRATE_CAPABILITY: advise-inline/v1 -->';

/** All targets share the canonical interview; adapters translate host syntax only. */
export function renderAdvisoryCapabilities(text: string): string {
  const begin = text.indexOf(START);
  const finish = text.indexOf(END, begin);
  if (text.split(START).length !== 2 || text.split(END).length !== 2
    || begin < 0 || finish < begin || text.slice(begin + START.length, finish).trim() !== INLINE) {
    throw new ControlPlaneError('VALIDATION_INVALID');
  }
  return text;
}

export function renderInlineAdviseCommand(canonical: string, questionTool: string): string {
  return renderAdvisoryCapabilities(canonical).replace(
    /(?:[A-Za-z][A-Za-z0-9+.-]*:|\/\/)[^\s<>"']+|\bAskUserQuestion\b/gu,
    (token) => token === 'AskUserQuestion' ? questionTool : token,
  );
}

export function renderAdvisoryInterviewWorkflow(text: string, questionTool?: string): string {
  const rendered = renderAdvisoryCapabilities(text);
  if (!questionTool || questionTool === 'AskUserQuestion') return rendered;
  return rendered.replace(
    /(?:[A-Za-z][A-Za-z0-9+.-]*:|\/\/)[^\s<>"']+|\bAskUserQuestion\b/gu,
    (token) => token === 'AskUserQuestion' ? questionTool : token,
  );
}
