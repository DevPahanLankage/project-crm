export type LeadSearchParams = Record<string, string | string[] | undefined>;

export function leadListHref(params: LeadSearchParams, updates: Record<string, string | string[] | null>) {
  const next = new URLSearchParams();
  for (const [key, raw] of Object.entries(params)) {
    const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
    values.filter(Boolean).forEach((value) => next.append(key, value));
  }
  for (const [key, value] of Object.entries(updates)) {
    next.delete(key);
    if (Array.isArray(value)) value.filter(Boolean).forEach((item) => next.append(key, item));
    else if (value) next.set(key, value);
  }
  const query = next.toString();
  return query ? `/leads?${query}` : "/leads";
}
