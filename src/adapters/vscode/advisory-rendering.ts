import {
  renderAdvisoryCapabilities,
  renderInlineAdviseCommand,
  renderAdvisoryInterviewWorkflow
} from '../advisory.js';

export function renderVscodeAdvisoryCapabilities(text: string): string {
  return renderAdvisoryCapabilities(text);
}

export function renderVscodeInlineAdviseCommand(
  canonical: string,
  questionTool = 'vscode/askQuestions'
): string {
  return renderInlineAdviseCommand(canonical, questionTool);
}

export function renderVscodeAdvisoryInterviewWorkflow(
  text: string,
  questionTool = 'vscode/askQuestions'
): string {
  return renderAdvisoryInterviewWorkflow(text, questionTool);
}

