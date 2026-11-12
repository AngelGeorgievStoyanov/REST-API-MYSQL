/** HTTP layers deliver repeated parameters as arrays; the API reads the first value. */
export function firstValue<T>(value: T | T[]): T {
  return Array.isArray(value) ? (value[0] as T) : value;
}

export function toIsoString(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}
