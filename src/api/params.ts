export function cleanQueryParam(value?: string | null) {
  if (value == null) return null;
  const normalized = value.trim();
  return normalized.length ? normalized : null;
}
