// HTTP client for astrologyapi.com (VedicAstroAPI).
// Uses HTTP Basic auth: userId:apiKey.
// Free tier gives 100 calls/day; production should cache aggressively.

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

// VedicAstroAPI sign slugs match our naming exactly.
const client = axios.create({
  baseURL: env.VEDIC_ASTRO_API_BASE_URL,
  timeout: 15_000,
  auth: {
    username: env.VEDIC_ASTRO_API_USER_ID,
    password: env.VEDIC_ASTRO_API_KEY,
  },
  headers: { 'Content-Type': 'application/json' },
});

// Maps the raw API response to our internal shape.
function normalise(sign: string, raw: Record<string, unknown>): VedicHoroscope {
  return {
    sign,
    general:     String((raw['prediction_today'] ?? raw['prediction'] ?? raw['lucky_elements'] ?? raw['bot_response'] ?? '')),
    love:        raw['love'] ? String(raw['love']) : undefined,
    career:      raw['career'] ? String(raw['career']) : undefined,
    health:      raw['health'] ? String(raw['health']) : undefined,
    wealth:      raw['wealth'] ?? raw['money'] ? String(raw['wealth'] ?? raw['money']) : undefined,
    luckyColor:  raw['lucky_color'] ? String(raw['lucky_color']) : undefined,
    luckyNumber: raw['lucky_number'] !== undefined ? String(raw['lucky_number']) : undefined,
    luckyDay:    raw['lucky_day'] ? String(raw['lucky_day']) : undefined,
  };
}

async function postSign(endpoint: string, sign: string, extra: Record<string, unknown> = {}): Promise<VedicHoroscope> {
  const body = { sign, ...extra };
  logger.debug({ endpoint, sign }, '[VedicAstro] fetching horoscope');
  const { data } = await client.post<Record<string, unknown>>(endpoint, body);
  return normalise(sign, data);
}

export async function getDailyHoroscope(sign: ZodiacSign): Promise<VedicHoroscope> {
  // POST /sun_sign_prediction/daily/:lang  body: { sign, date: 'YYYY-MM-DD' }
  const today = new Date().toISOString().slice(0, 10);
  return postSign('/sun_sign_prediction/daily/en', sign, { date: today });
}

export async function getWeeklyHoroscope(sign: ZodiacSign): Promise<VedicHoroscope> {
  return postSign('/sun_sign_prediction/weekly', sign);
}

export async function getMonthlyHoroscope(sign: ZodiacSign): Promise<VedicHoroscope> {
  return postSign('/sun_sign_prediction/monthly', sign);
}

export async function getYearlyHoroscope(sign: ZodiacSign): Promise<VedicHoroscope> {
  return postSign('/sun_sign_prediction/yearly', sign);
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
  isManglik:     boolean;
  manglikPct:    number;
  description:   string;
  remedies:      string[];
}

export interface KaalSarpDosha {
  isPresent:  boolean;
  type:       string;
  severity:   string;
  description:string;
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
  astroDetails:      Record<string, unknown>;   // raw /astro_details response
  planets:           PlanetData[];
  houseCusps:        HouseCusp[];               // bhav_madhya house midpoints
  dasha:             DashaPeriod[];             // lifetime major Vimshottari periods
  currentDasha:      Record<string, unknown> | null; // current active dasha (all levels)
  mangalDosha:       MangalDosha | null;
  kaalSarpDosha:     KaalSarpDosha | null;
  sadeSatiStatus:    Record<string, unknown> | null;
  sadeSatiLife:      Record<string, unknown> | null;
  pitraDosha:        Record<string, unknown> | null;
  generalPrediction: string | null;
  chartImageD1:      string | null;             // Rashi (birth chart) SVG/image
  chartImageD9:      string | null;             // Navamsha chart SVG/image
  input:             BirthChartInput;
  computedAt:        string;
}

// For backward compat keep the old name as an alias
export type KundliChartData = FullKundliChartData;

async function postBirth<T>(endpoint: string, input: BirthChartInput): Promise<T> {
  logger.debug({ endpoint }, '[VedicAstro] fetching birth chart data');
  const { data } = await client.post<T>(endpoint, input);
  return data;
}

function normalisePlanets(raw: Record<string, unknown>[]): PlanetData[] {
  return raw.map((p) => ({
    name:           String(p['name'] ?? ''),
    fullDegree:     Number(p['fullDegree'] ?? p['full_degree'] ?? 0),
    normDegree:     Number(p['normDegree'] ?? p['norm_degree'] ?? 0),
    speed:          Number(p['speed'] ?? 0),
    isRetro:        String(p['isRetro'] ?? p['is_retro'] ?? 'false') === 'true',
    sign:           String(p['sign'] ?? ''),
    signLord:       String(p['signLord'] ?? p['sign_lord'] ?? ''),
    nakshatra:      String(p['nakshatra'] ?? ''),
    nakshatraLord:  String(p['nakshatraLord'] ?? p['nakshatra_lord'] ?? ''),
    nakshatraPada:  Number(p['nakshatraPada'] ?? p['nakshatra_pada'] ?? 0),
    house:          Number(p['house'] ?? 0),
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
  // /astro_details returns ascendant inside an 'ascendant' key or at root level
  const asc = (raw['ascendant'] ?? raw) as Record<string, unknown>;
  return {
    sign:          String(asc['sign'] ?? asc['ascendant_sign'] ?? ''),
    signLord:      String(asc['signLord'] ?? asc['sign_lord'] ?? ''),
    degree:        Number(asc['degree'] ?? asc['ascendant_degree'] ?? 0),
    nakshatra:     String(asc['nakshatra'] ?? ''),
    nakshatraLord: String(asc['nakshatraLord'] ?? asc['nakshatra_lord'] ?? ''),
    nakshatraPada: Number(asc['nakshatraPada'] ?? asc['nakshatra_pada'] ?? 0),
  };
}

function normaliseDasha(raw: Record<string, unknown>): DashaPeriod[] {
  const periods = (raw['dasha_periods'] ?? raw['vimshottari_dasha'] ?? raw) as Record<string, unknown>[];
  if (!Array.isArray(periods)) return [];
  return periods.map((p) => ({
    planet:    String(p['planet'] ?? p['dasha_planet'] ?? ''),
    startDate: String(p['start_date'] ?? p['startDate'] ?? ''),
    endDate:   String(p['end_date'] ?? p['endDate'] ?? ''),
    antars: ((p['antardasha'] ?? p['antars'] ?? []) as Record<string, unknown>[]).map((a) => ({
      planet:    String(a['planet'] ?? a['antar_planet'] ?? ''),
      startDate: String(a['start_date'] ?? a['startDate'] ?? ''),
      endDate:   String(a['end_date'] ?? a['endDate'] ?? ''),
      pratyantar: ((a['pratyantar'] ?? a['prat'] ?? []) as Record<string, unknown>[]).map((pr) => ({
        planet:    String(pr['planet'] ?? ''),
        startDate: String(pr['start_date'] ?? pr['startDate'] ?? ''),
        endDate:   String(pr['end_date'] ?? pr['endDate'] ?? ''),
      })),
    })),
  }));
}

function normaliseMangal(raw: Record<string, unknown>): MangalDosha {
  return {
    isManglik:   Boolean(raw['is_manglik'] ?? raw['isManglik'] ?? false),
    manglikPct:  Number(raw['manglik_pct'] ?? raw['manglikPct'] ?? 0),
    description: String(raw['description'] ?? raw['bot_response'] ?? ''),
    remedies:    Array.isArray(raw['remedy']) ? (raw['remedy'] as string[]) : [],
  };
}

function normaliseKaalSarp(raw: Record<string, unknown>): KaalSarpDosha {
  return {
    isPresent:   Boolean(raw['present'] ?? raw['is_kaal_sarp'] ?? false),
    type:        String(raw['type'] ?? ''),
    severity:    String(raw['severity'] ?? ''),
    description: String(raw['description'] ?? raw['bot_response'] ?? ''),
  };
}

// Safe fetch — if an endpoint fails (e.g. no API key), return null instead of breaking the whole report
async function tryPostBirth<T>(endpoint: string, input: BirthChartInput): Promise<T | null> {
  try {
    return await postBirth<T>(endpoint, input);
  } catch (err) {
    logger.warn({ endpoint, err }, '[VedicAstro] optional endpoint failed, skipping');
    return null;
  }
}

export async function getBirthChartData(input: BirthChartInput): Promise<FullKundliChartData> {
  // Mandatory: planets + basic astro details (includes ascendant + houses)
  const [planetsRaw, astroDetailsRaw, bhavMadhyaRaw] = await Promise.all([
    postBirth<Record<string, unknown>[]>('/planets/extended', input),
    postBirth<Record<string, unknown>>('/astro_details', input),
    postBirth<Record<string, unknown>[]>('/bhav_madhya', input),
  ]);

  // Optional enrichment — failures don't block the report
  const [
    majorDashaRaw, currentDashaRaw,
    mangalRaw, kaalSarpRaw,
    sadeSatiStatusRaw, sadeSatiLifeRaw, pitraRaw,
    generalRaw,
    chartD1Raw, chartD9Raw,
  ] = await Promise.all([
    tryPostBirth<Record<string, unknown>>('/major_vdasha', input),
    tryPostBirth<Record<string, unknown>>('/current_vdasha_all', input),
    tryPostBirth<Record<string, unknown>>('/manglik', input),
    tryPostBirth<Record<string, unknown>>('/kalsarpa_details', input),
    tryPostBirth<Record<string, unknown>>('/sadhesati_current_status', input),
    tryPostBirth<Record<string, unknown>>('/sadhesati_life_details', input),
    tryPostBirth<Record<string, unknown>>('/pitra_dosha_report', input),
    tryPostBirth<Record<string, unknown>>('/general_ascendant_report', input),
    tryPostBirth<Record<string, unknown>>('/horo_chart_image/D1', input),
    tryPostBirth<Record<string, unknown>>('/horo_chart_image/D9', input),
  ]);

  return {
    ascendant:         normaliseAscendant(astroDetailsRaw),
    planets:           normalisePlanets(planetsRaw),
    houseCusps:        normaliseHouseCusps(bhavMadhyaRaw),
    astroDetails:      astroDetailsRaw,
    dasha:             majorDashaRaw ? normaliseDasha(majorDashaRaw) : [],
    currentDasha:      currentDashaRaw ?? null,
    mangalDosha:       mangalRaw ? normaliseMangal(mangalRaw) : null,
    kaalSarpDosha:     kaalSarpRaw ? normaliseKaalSarp(kaalSarpRaw) : null,
    sadeSatiStatus:    sadeSatiStatusRaw ?? null,
    sadeSatiLife:      sadeSatiLifeRaw ?? null,
    pitraDosha:        pitraRaw ?? null,
    generalPrediction: generalRaw ? String(generalRaw['bot_response'] ?? generalRaw['prediction'] ?? '') : null,
    chartImageD1:      chartD1Raw ? String(chartD1Raw['svg'] ?? chartD1Raw['chart_image'] ?? '') || null : null,
    chartImageD9:      chartD9Raw ? String(chartD9Raw['svg'] ?? chartD9Raw['chart_image'] ?? '') || null : null,
    input,
    computedAt:        new Date().toISOString(),
  };
}
