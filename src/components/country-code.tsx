import { getCountry, getCountryFlagClass, normalizeCountryCode } from "@/lib/countries";

export function CountryCode({ code, className }: { code: string | null | undefined; className?: string }) {
  const normalized = normalizeCountryCode(code);
  if (!normalized) return <span className="muted">-</span>;

  const country = getCountry(normalized);
  const flagClass = getCountryFlagClass(normalized);

  return (
    <span className={["country-code", className].filter(Boolean).join(" ")} title={country?.name ?? normalized}>
      {flagClass && <span className={`country-flag ${flagClass}`} aria-hidden="true" />}
      <span>{country?.code ?? normalized}</span>
    </span>
  );
}
