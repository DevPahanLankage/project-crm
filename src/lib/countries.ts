import { hasFlag } from "country-flag-icons";

export type Country = { code: string; name: string };

const ISO_ALPHA_2_CODES = "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(" ");
const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

export const COUNTRIES: readonly Country[] = ISO_ALPHA_2_CODES.map((code) => ({ code, name: regionNames.of(code) ?? code }));

export function normalizeCountryCode(value: string | null | undefined) {
  return value?.trim().toUpperCase() || null;
}

export function getCountry(code: string | null | undefined) {
  const normalized = normalizeCountryCode(code);
  return COUNTRIES.find((country) => country.code === normalized) ?? null;
}

export function getCountryFlagClass(code: string | null | undefined) {
  const normalized = normalizeCountryCode(code);
  return normalized && hasFlag(normalized) ? `flag:${normalized}` : null;
}

export function getCountryCodesMatching(value: string) {
  const raw = value.trim();
  const selectedCode = raw.match(/^([a-z]{2})\s*\//i)?.[1]?.toUpperCase();
  if (selectedCode && ISO_ALPHA_2_CODES.includes(selectedCode)) return [selectedCode];
  const term = raw.toLocaleLowerCase();
  if (!term) return [];
  return COUNTRIES.filter((country) =>
    country.code.toLocaleLowerCase().includes(term) || country.name.toLocaleLowerCase().includes(term),
  ).map((country) => country.code);
}
