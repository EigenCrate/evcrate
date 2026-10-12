import { createHash } from 'node:crypto';
import {
  ACTOR_ID_PATTERN,
  CompanionContractError,
  STORAGE_AND_SOURCE_BOUNDS
} from './runtime-contracts.js';

export interface RenderAgentInput {
  readonly actorId: string;
  readonly templateContent: string;
  readonly modelSelector: string | null;
  readonly pluginFsPath?: string;
}

export interface RenderedAgentResult {
  readonly actorId: string;
  readonly content: string;
  readonly byteLength: number;
  readonly sha256: string;
}

export function renderAgentTemplate(input: RenderAgentInput): RenderedAgentResult {
  const { actorId, templateContent, modelSelector, pluginFsPath } = input;
  if (typeof actorId !== 'string' || actorId.length > 64 || !ACTOR_ID_PATTERN.test(actorId)) {
    throw new CompanionContractError('CONTRACT_INVALID', `Invalid actorId "${actorId}"`);
  }
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/u.exec(templateContent);
  if (!match) {
    throw new CompanionContractError('CONTRACT_INVALID', `Template for actor "${actorId}" missing YAML frontmatter`);
  }
  const [, rawFrontmatter, rawBody] = match;
  const inLines = rawFrontmatter.split(/\r?\n/u);
  const outLines: string[] = [];
  let skippingModelBlock = false;
  for (const line of inLines) {
    if (/^model\s*:/u.test(line)) {
      skippingModelBlock = true;
      continue;
    }
    if (skippingModelBlock) {
      if (/^\s+/u.test(line)) continue;
      skippingModelBlock = false;
    }
    outLines.push(line);
  }
  if (modelSelector !== null && modelSelector.trim() !== '') {
    const escapedSelector = JSON.stringify(modelSelector.trim());
    const nameIndex = outLines.findIndex((l) => /^name\s*:/u.test(l));
    if (nameIndex >= 0) {
      outLines.splice(nameIndex + 1, 0, `model: ${escapedSelector}`);
    } else {
      outLines.push(`model: ${escapedSelector}`);
    }
  }
  let transformedBody = rawBody;
  if (pluginFsPath && pluginFsPath.trim() !== '') {
    const segments = rawBody.split(/(```[\s\S]*?```)/gu);
    transformedBody = segments.map((seg, idx) => {
      if (idx % 2 === 1) return seg; // inside code fence: preserve verbatim
      return seg.replace(/(?<=(?:`|\(|["'\s]))(\.?\/\.evcrate-vscode\/[^\s`"')]+)/gu, (ref) => {
        if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//u.test(ref)) return ref;
        const stripped = ref.replace(/^\.?\/\.evcrate-vscode\//u, '');
        return `${pluginFsPath}/${stripped}`;
      });
    }).join('');
  }
  const renderedContent = `---\n${outLines.join('\n')}\n---\n\n${transformedBody.trimStart()}`;
  const byteLength = Buffer.byteLength(renderedContent, 'utf8');
  if (byteLength > STORAGE_AND_SOURCE_BOUNDS.maxTemplateBytes) {
    throw new CompanionContractError('BOUNDS_EXCEEDED', `Rendered agent "${actorId}" exceeds 1 MiB limit (${byteLength} bytes)`);
  }
  const sha256 = createHash('sha256').update(renderedContent, 'utf8').digest('hex');
  return Object.freeze({ actorId, content: renderedContent, byteLength, sha256 });
}
