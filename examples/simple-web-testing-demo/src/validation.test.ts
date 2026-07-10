import { describe, expect, it } from 'vitest';
import { getNameValidationMessage, MAX_TESTER_NAME_LENGTH } from './validation';

describe('getNameValidationMessage', () => {
  it('requires a tester name', () => {
    expect(getNameValidationMessage('')).toBe('Enter a tester name before submitting.');
    expect(getNameValidationMessage('   ')).toBe('Enter a tester name before submitting.');
  });

  it('allows names at the configured maximum length', () => {
    expect(getNameValidationMessage('A'.repeat(MAX_TESTER_NAME_LENGTH))).toBe('');
  });

  it('rejects names longer than the configured maximum length', () => {
    expect(getNameValidationMessage('A'.repeat(MAX_TESTER_NAME_LENGTH + 1))).toBe(
      `Tester name must be ${MAX_TESTER_NAME_LENGTH} characters or fewer.`,
    );
  });

  it('accepts valid names after trimming surrounding whitespace', () => {
    expect(getNameValidationMessage('  Mira Tester  ')).toBe('');
  });
});