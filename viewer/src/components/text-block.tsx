import type { FC } from 'react';

export interface TextBlockProps {
  readonly content: unknown;
  readonly label?: string;
  readonly asPre?: boolean;
  readonly className?: string;
}

export function sanitizeTextContent(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean' || typeof val === 'bigint') {
    return String(val);
  }
  try {
    return JSON.stringify(val, null, 2);
  } catch {
    return '[Unserializable Object]';
  }
}

export const TextBlock: FC<TextBlockProps> = ({
  content,
  label,
  asPre = true,
  className = ''
}) => {
  const text = sanitizeTextContent(content);
  const isEmpty = text.trim().length === 0;

  return (
    <div className={`text-block-wrapper ${className}`}>
      {label && <div className="text-block-label">{label}</div>}
      {isEmpty ? (
        <div className="text-block-empty text-muted">(none)</div>
      ) : asPre ? (
        <pre className="text-block-pre">{text}</pre>
      ) : (
        <div className="text-block-text">{text}</div>
      )}
    </div>
  );
};
