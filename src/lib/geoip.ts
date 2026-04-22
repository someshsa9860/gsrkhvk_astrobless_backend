// IP-to-location lookup using MaxMind GeoLite2 data bundled in geoip-lite.
// Returns null for private/loopback addresses and unrecognised IPs.

import * as geoip from 'geoip-lite';

export interface GeoLocation {
  city: string | null;
  state: string | null;
  country: string | null;
  countryCode: string | null;
}

const PRIVATE_IP_PREFIXES = ['127.', '10.', '172.16.', '172.17.', '172.18.', '172.19.',
  '172.20.', '172.21.', '172.22.', '172.23.', '172.24.', '172.25.', '172.26.', '172.27.',
  '172.28.', '172.29.', '172.30.', '172.31.', '192.168.', '::1', 'fc', 'fd', '0.0.0.0'];

function isPrivate(ip: string): boolean {
  return PRIVATE_IP_PREFIXES.some((prefix) => ip.startsWith(prefix));
}

// Extracts the first public IP from a possibly comma-separated X-Forwarded-For value.
function extractClientIp(raw: string): string {
  return (raw.split(',')[0] ?? raw).trim();
}

export function lookupIp(rawIp: string | undefined): GeoLocation {
  if (!rawIp) return { city: null, state: null, country: null, countryCode: null };

  const ip = extractClientIp(rawIp);
  if (isPrivate(ip)) return { city: null, state: null, country: null, countryCode: null };

  const geo = geoip.lookup(ip);
  if (!geo) return { city: null, state: null, country: null, countryCode: null };

  return {
    city: geo.city || null,
    state: geo.region || null,
    country: geo.country ? countryCodeToName(geo.country) : null,
    countryCode: geo.country || null,
  };
}

// ISO 3166-1 alpha-2 → common name for the most relevant countries.
// Falls back to the code itself for unlisted countries.
function countryCodeToName(code: string): string {
  const map: Record<string, string> = {
    IN: 'India', US: 'United States', GB: 'United Kingdom', CA: 'Canada',
    AU: 'Australia', DE: 'Germany', FR: 'France', SG: 'Singapore',
    AE: 'UAE', SA: 'Saudi Arabia', MY: 'Malaysia', NZ: 'New Zealand',
    NG: 'Nigeria', KE: 'Kenya', ZA: 'South Africa', PK: 'Pakistan',
    BD: 'Bangladesh', LK: 'Sri Lanka', NP: 'Nepal', PH: 'Philippines',
  };
  return map[code] ?? code;
}
