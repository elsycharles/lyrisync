let counter = 0;

/** Short unique id for list keys. Not security sensitive. */
export function createId(): string {
  counter += 1;
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${counter}`;
}
