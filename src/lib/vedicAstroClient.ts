// HTTP client for vedicastroapi.com v3-json API.
// Auth: ?api_key=YOUR_API_KEY query param on every request (no userId needed).
// All requests are GET. Free tier: 500 calls/day.

import axios from 'axios';
import { env } from '../config/env.js';
import { logger } from './logger.js';

const ZODIAC_SIGNS = [
  'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
  'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces',
] as const;

export type ZodiacSign = typeof ZODIAC_SIGNS[number];

export interface VedicHoroscope {
  sign: string;
  general: string;
  love?: string;
  career?: string;
  health?: string;
  wealth?: string;
  luckyColor?: string;
  luckyNumber?: string;
  luckyDay?: string;
}

const client = axios.create({
  baseURL: 'https://api.vedicastroapi.com/v3-json',
  timeout: 15_000,
  params: { api_key: env.VEDIC_ASTRO_API_KEY, lang: 'en' },
});

// v3-json responses wrap data as { status: 200, response: { ... } }
function unwrap<T>(data: { status: number; response: T }): T {
  return data.response;
}

// API expects zodiac as a 1-based index (1=Aries … 12=Pisces)
const ZODIAC_INDEX: Record<ZodiacSign, number> = {
  aries: 1, taurus: 2, gemini: 3, cancer: 4, leo: 5, virgo: 6,
  libra: 7, scorpio: 8, sagittarius: 9, capricorn: 10, aquarius: 11, pisces: 12,
};

function normalise(sign: string, raw: Record<string, unknown>): VedicHoroscope {
  // lucky_number may be an array — join to string
  const ln = raw['lucky_number'];
  const luckyNumber = Array.isArray(ln) ? ln.join(', ') : (ln !== undefined ? String(ln) : undefined);

  return {
    sign,
    general:     String(raw['bot_response'] ?? raw['prediction'] ?? raw['prediction_today'] ?? ''),
    career:      raw['career'] !== undefined ? String(raw['career']) : undefined,
    health:      raw['health'] !== undefined ? String(raw['health']) : undefined,
    luckyColor:  raw['lucky_color'] ? String(raw['lucky_color']) : undefined,
    luckyNumber,
  };
}

async function getSign(endpoint: string, sign: ZodiacSign, extra: Record<string, unknown> = {}): Promise<VedicHoroscope> {
  logger.debug({ endpoint, sign }, '[VedicAstro] fetching horoscope');
  const { data } = await client.get<{ status: number; response: Record<string, unknown> }>(endpoint, {
    params: { zodiac: ZODIAC_INDEX[sign], ...extra },
  });
  return normalise(sign, unwrap(data));
}

export async function getDailyHoroscope(sign: ZodiacSign): Promise<VedicHoroscope> {
  // date param required: DD/MM/YYYY (today)
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  return getSign('/prediction/daily-sun', sign, { date: `${dd}/${mm}/${yyyy}` });
}

export async function getWeeklyHoroscope(sign: ZodiacSign): Promise<VedicHoroscope> {
  return getSign('/prediction/weekly-sun', sign, { week: 'thisweek' });
}

export async function getMonthlyHoroscope(sign: ZodiacSign): Promise<VedicHoroscope> {
  // No monthly-sun endpoint in v3-json API — use weekly as best available approximation
  return getSign('/prediction/weekly-sun', sign, { week: 'thisweek' });
}

export async function getYearlyHoroscope(sign: ZodiacSign): Promise<VedicHoroscope> {
  return getSign('/prediction/yearly', sign, { year: new Date().getFullYear() });
}

export { ZODIAC_SIGNS };

// ── Birth chart (Kundli) ──────────────────────────────────────────────────────

export interface BirthChartInput {
  day: number;
  month: number;
  year: number;
  hour: number;
  min: number;
  lat: number;
  lon: number;
  tzone: number; // e.g. 5.5 for IST
}

export interface PlanetData {
  name: string;
  fullDegree: number;
  normDegree: number;
  speed: number;
  isRetro: boolean;
  sign: string;
  signLord: string;
  nakshatra: string;
  nakshatraLord: string;
  nakshatraPada: number;
  house: number;
}

export interface HouseCusp {
  house: number;
  sign: string;
  degree: number;
}

export interface DashaPeriod {
  planet: string;
  startDate: string;  // ISO date
  endDate:   string;
  antars: Array<{
    planet:     string;
    startDate:  string;
    endDate:    string;
    pratyantar: Array<{ planet: string; startDate: string; endDate: string }>;
  }>;
}

export interface MangalDosha {
  isManglik:   boolean;
  manglikPct:  number;
  description: string;
  remedies:    string[];
}

export interface KaalSarpDosha {
  isPresent:   boolean;
  type:        string;
  severity:    string;
  description: string;
}

export interface FullKundliChartData {
  ascendant: {
    sign: string;
    signLord: string;
    degree: number;
    nakshatra: string;
    nakshatraLord: string;
    nakshatraPada: number;
  };
  astroDetails:      Record<string, unknown>;
  planets:           PlanetData[];
  houseCusps:        HouseCusp[];
  dasha:             DashaPeriod[];
  currentDasha:      Record<string, unknown> | null;
  mangalDosha:       MangalDosha | null;
  kaalSarpDosha:     KaalSarpDosha | null;
  sadeSatiStatus:    Record<string, unknown> | null;
  sadeSatiLife:      Record<string, unknown> | null;
  pitraDosha:        Record<string, unknown> | null;
  generalPrediction: string | null;
  chartImageD1:      string | null;  // Rashi (birth chart) SVG
  chartImageD9:      string | null;  // Navamsha chart SVG
  input:             BirthChartInput;
  computedAt:        string;
}

// For backward compat keep the old name as an alias
export type KundliChartData = FullKundliChartData;

// Convert internal BirthChartInput to vedicastroapi.com v3-json query params
function birthParams(input: BirthChartInput): Record<string, unknown> {
  const dd = String(input.day).padStart(2, '0');
  const mm = String(input.month).padStart(2, '0');
  const hh = String(input.hour).padStart(2, '0');
  const mn = String(input.min).padStart(2, '0');
  return {
    dob: `${dd}/${mm}/${input.year}`,
    tob: `${hh}:${mn}`,
    lat: input.lat,
    lon: input.lon,
    tz:  input.tzone,
  };
}

async function getBirth<T>(endpoint: string, input: BirthChartInput): Promise<T> {
  logger.debug({ endpoint }, '[VedicAstro] fetching birth chart data');
  const { data } = await client.get<{ status: number; response: T }>(endpoint, {
    params: birthParams(input),
  });
  return unwrap(data);
}

// planet-details returns an indexed object { "0": {...}, "1": {...}, ... }
function normalisePlanets(raw: Record<string, Record<string, unknown>>): PlanetData[] {
  return Object.values(raw).map((p) => ({
    name:          String(p['name'] ?? ''),
    fullDegree:    Number(p['global_degree'] ?? p['full_degree'] ?? p['fullDegree'] ?? 0),
    normDegree:    Number(p['local_degree'] ?? p['norm_degree'] ?? p['normDegree'] ?? 0),
    speed:         Number(p['speed'] ?? 0),
    isRetro:       String(p['is_retro'] ?? p['isRetro'] ?? 'false').toLowerCase() === 'true',
    sign:          String(p['zodiac'] ?? p['sign'] ?? ''),
    signLord:      String(p['sign_lord'] ?? p['signLord'] ?? ''),
    nakshatra:     String(p['nakshatra'] ?? ''),
    nakshatraLord: String(p['nakshatra_lord'] ?? p['nakshatraLord'] ?? ''),
    nakshatraPada: Number(p['nakshatra_pada'] ?? p['nakshatraPada'] ?? 0),
    house:         Number(p['house'] ?? 0),
  }));
}

function normaliseHouseCusps(raw: Record<string, unknown>[]): HouseCusp[] {
  return raw.map((h) => ({
    house:  Number(h['house'] ?? 0),
    sign:   String(h['sign'] ?? ''),
    degree: Number(h['degree'] ?? h['cusp'] ?? 0),
  }));
}

function normaliseAscendant(raw: Record<string, unknown>): FullKundliChartData['ascendant'] {
  // ascendant-report returns fields at the response root level
  return {
    sign:          String(raw['ascendant'] ?? raw['sign'] ?? raw['ascendant_sign'] ?? ''),
    signLord:      String(raw['sign_lord'] ?? raw['signLord'] ?? ''),
    degree:        Number(raw['degree'] ?? raw['ascendant_degree'] ?? 0),
    nakshatra:     String(raw['nakshatra'] ?? ''),
    nakshatraLord: String(raw['nakshatra_lord'] ?? raw['nakshatraLord'] ?? ''),
    nakshatraPada: Number(raw['nakshatra_pada'] ?? raw['nakshatraPada'] ?? 0),
  };
}

// maha-dasha returns { mahadasha: [ { name, start, end }, ... ] }
function normaliseDasha(raw: Record<string, unknown>): DashaPeriod[] {
  const periods = (raw['mahadasha'] ?? []) as Record<string, unknown>[];
  if (!Array.isArray(periods)) return [];
  return periods.map((p) => ({
    planet:    String(p['name'] ?? p['planet'] ?? ''),
    startDate: String(p['start'] ?? p['start_date'] ?? p['startDate'] ?? ''),
    endDate:   String(p['end'] ?? p['end_date'] ?? p['endDate'] ?? ''),
    antars:    [],  // full antar data available via separate endpoint if needed
  }));
}

function normaliseMangal(raw: Record<string, unknown>): MangalDosha {
  // mangal-dosh response shape: { factors: { ... }, ... }
  const factors = (raw['factors'] ?? {}) as Record<string, unknown>;
  const isPresent = Object.values(factors).some(Boolean);
  return {
    isManglik:   Boolean(raw['is_manglik'] ?? raw['isManglik'] ?? isPresent),
    manglikPct:  Number(raw['manglik_pct'] ?? raw['manglikPct'] ?? 0),
    description: String(raw['bot_response'] ?? raw['description'] ?? ''),
    remedies:    Array.isArray(raw['remedy']) ? (raw['remedy'] as string[]) : [],
  };
}

function normaliseKaalSarp(raw: Record<string, unknown>): KaalSarpDosha {
  return {
    isPresent:   Boolean(raw['is_dosha_present'] ?? raw['is_kaal_sarp'] ?? false),
    type:        String(raw['dosha_type'] ?? raw['type'] ?? ''),
    severity:    String(raw['dosha_direction'] ?? raw['severity'] ?? ''),
    description: String(raw['bot_response'] ?? raw['description'] ?? ''),
  };
}

async function tryGetBirth<T>(endpoint: string, input: BirthChartInput): Promise<T | null> {
  try {
    return await getBirth<T>(endpoint, input);
  } catch (err) {
    logger.warn({ endpoint, err }, '[VedicAstro] optional endpoint failed, skipping');
    return null;
  }
}

export async function getBirthChartData(input: BirthChartInput): Promise<FullKundliChartData> {
  // Mandatory: planet positions + ascendant details
  const [planetsRaw, ascRaw] = await Promise.all([
    getBirth<Record<string, Record<string, unknown>>>('/horoscope/planet-details', input),
    getBirth<Record<string, unknown>>('/horoscope/ascendant-report', input),
  ]);

  // Optional enrichment — failures don't block the report
  const [
    majorDashaRaw, currentDashaRaw,
    mangalRaw, kaalSarpRaw,
    sadeSatiStatusRaw, pitraRaw,
    generalRaw,
    chartD1Raw, chartD9Raw,
  ] = await Promise.all([
    tryGetBirth<Record<string, unknown>>('/dashas/maha-dasha', input),
    tryGetBirth<Record<string, unknown>>('/dashas/current-mahadasha', input),
    tryGetBirth<Record<string, unknown>>('/dosha/mangal-dosh', input),
    tryGetBirth<Record<string, unknown>>('/dosha/kaalsarp-dosh', input),
    tryGetBirth<Record<string, unknown>>('/extended-horoscope/current-sade-sati', input),
    tryGetBirth<Record<string, unknown>>('/dosha/pitra-dosh', input),
    tryGetBirth<Record<string, unknown>>('/extended-horoscope/extended-kundli-details', input),
    tryGetBirth<Record<string, unknown>>('/horoscope/chart-image', input),
    tryGetBirth<Record<string, unknown>>('/horoscope/chart-image', { ...input }),  // D9 via divisional param if supported
  ]);

  return {
    ascendant:         normaliseAscendant(ascRaw),
    planets:           normalisePlanets(planetsRaw),
    houseCusps:        normaliseHouseCusps([]),  // house cusps come from planet-details.house fields
    astroDetails:      ascRaw,
    dasha:             majorDashaRaw ? normaliseDasha(majorDashaRaw) : [],
    currentDasha:      currentDashaRaw ?? null,
    mangalDosha:       mangalRaw ? normaliseMangal(mangalRaw) : null,
    kaalSarpDosha:     kaalSarpRaw ? normaliseKaalSarp(kaalSarpRaw) : null,
    sadeSatiStatus:    sadeSatiStatusRaw ?? null,
    sadeSatiLife:      null,
    pitraDosha:        pitraRaw ?? null,
    generalPrediction: generalRaw ? String(generalRaw['bot_response'] ?? '') || null : null,
    chartImageD1:      chartD1Raw ? String(chartD1Raw['svg'] ?? chartD1Raw['chart_image'] ?? '') || null : null,
    chartImageD9:      chartD9Raw ? String(chartD9Raw['svg'] ?? chartD9Raw['chart_image'] ?? '') || null : null,
    input,
    computedAt:        new Date().toISOString(),
  };
}
