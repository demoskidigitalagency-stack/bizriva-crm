/**
 * Presentation-level formatting helpers.
 * Currency handling is generic: the workspace supplies the currency code.
 */

export type CurrencyCode = "NGN" | "USD" | "GBP" | "EUR" | "KES" | "GHS" | "ZAR";

const LOCALE_BY_CURRENCY: Record<CurrencyCode, string> = {
  NGN: "en-NG",
  USD: "en-US",
  GBP: "en-GB",
  EUR: "de-DE",
  KES: "en-KE",
  GHS: "en-GH",
  ZAR: "en-ZA",
};

export function formatCurrency(
  value: number,
  currency: CurrencyCode = "NGN",
  options: { compact?: boolean; decimals?: number } = {},
): string {
  const { compact = false, decimals = 0 } = options;
  return new Intl.NumberFormat(LOCALE_BY_CURRENCY[currency] ?? "en-US", {
    style: "currency",
    currency,
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : decimals,
    minimumFractionDigits: 0,
  }).format(value);
}

export function formatNumber(value: number, compact = false): string {
  return new Intl.NumberFormat("en-US", {
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

export function formatDate(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(d);
}


export function formatDateShort(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

export function formatDateTime(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function relativeTime(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const diff = d.getTime() - Date.now();
  const abs = Math.abs(diff);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < hour) return rtf.format(Math.round(diff / minute), "minute");
  if (abs < day) return rtf.format(Math.round(diff / hour), "hour");
  if (abs < 30 * day) return rtf.format(Math.round(diff / day), "day");
  return rtf.format(Math.round(diff / (30 * day)), "month");
}

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

const FLAGS: Record<string, string> = {
  NG: "🇳🇬",
  GH: "🇬🇭",
  KE: "🇰🇪",
  ZA: "🇿🇦",
  GB: "🇬🇧",
  US: "🇺🇸",
  CA: "🇨🇦",
  AE: "🇦🇪",
};

export function countryFlag(code: string): string {
  return FLAGS[code] ?? "🏳️";
}

const COUNTRY_NAMES: Record<string, string> = {
  NG: "Nigeria",
  GH: "Ghana",
  KE: "Kenya",
  ZA: "South Africa",
  GB: "United Kingdom",
  US: "United States",
  CA: "Canada",
  AE: "United Arab Emirates",
};

export function countryName(code: string): string {
  return COUNTRY_NAMES[code] ?? code;
}