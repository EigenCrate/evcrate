export const MAX_TESTER_NAME_LENGTH = 80;

export function getNameValidationMessage(value: string): string {
  const trimmedValue = value.trim();

  if (trimmedValue.length === 0) {
    return 'Enter a tester name before submitting.';
  }

  if (trimmedValue.length > MAX_TESTER_NAME_LENGTH) {
    return `Tester name must be ${MAX_TESTER_NAME_LENGTH} characters or fewer.`;
  }

  return '';
}
