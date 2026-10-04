import { ControlPlaneError } from '../../errors/control-plane-error.js';
import {
  renderAdvisoryCapabilities,
  renderInlineAdviseCommand,
  renderAdvisoryInterviewWorkflow,
  MENTORING_START,
  MENTORING_END,
  CANONICAL_MENTORING
} from '../advisory.js';
import { ADVISE_AGENT_RELAY_UNSUPPORTED_VSCODE } from './advisory-types.js';

export function renderVscodeAdvisoryCapabilities(text: string): string {
  return renderAdvisoryCapabilities(text, 'vscode');
}

export function renderVscodeInlineAdviseCommand(
  canonical: string,
  questionTool = 'vscode/askQuestions'
): string {
  return renderInlineAdviseCommand(canonical, 'vscode', questionTool);
}

export function renderVscodeAdvisoryInterviewWorkflow(text: string): string {
  return renderAdvisoryInterviewWorkflow(text, 'vscode');
}

export function renderVscodeMentoringWorkflow(
  text: string,
  options?: {
    readonly mentoring?: 'supported' | 'unavailable';
    readonly writeChecks?: 'advisory-only' | 'unavailable';
  }
): string {
  const starts = text.split(MENTORING_START).length - 1;
  const ends = text.split(MENTORING_END).length - 1;
  const begin = text.indexOf(MENTORING_START);
  const finish = text.indexOf(MENTORING_END, begin);

  if (
    starts !== 1 ||
    ends !== 1 ||
    begin < 0 ||
    finish < begin ||
    text.slice(begin + MENTORING_START.length, finish).trim() !== CANONICAL_MENTORING
  ) {
    throw new ControlPlaneError('VALIDATION_INVALID');
  }

  const mentoring = options?.mentoring ?? 'supported';
  const writeChecks = options?.writeChecks ?? 'advisory-only';

  const block = [
    MENTORING_START,
    `<!-- EVCRATE_CAPABILITY: mentoring/${mentoring}/v2 -->`,
    `<!-- EVCRATE_CAPABILITY: write-checks/vscode/${writeChecks}/v1 -->`,
    MENTORING_END
  ].join('\n');

  return `${text.slice(0, begin)}${block}${text.slice(finish + MENTORING_END.length)}`;
}
