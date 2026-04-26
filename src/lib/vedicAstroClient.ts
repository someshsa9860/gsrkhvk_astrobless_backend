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

// ── Ashtakvarga ───────────────────────────────────────────────────────────────

export type AshtakvargaPlanet =
  | 'Sun' | 'Moon' | 'Mars' | 'Mercury' | 'Jupiter' | 'Venus' | 'Saturn' | 'total';

export interface AshtakvargaData {
  planet: string;
  scores: Record<string, number>;  // sign name → bindus (0-8)
  chartImage: string | null;        // SVG / base64 — fetched fresh, never persisted
}

export async function getAshtakvarga(
  input: BirthChartInput,
  planet: AshtakvargaPlanet = 'total',
): Promise<AshtakvargaData> {
  logger.debug({ planet }, '[VedicAstro] fetching ashtakvarga');
  const { data } = await client.get<{ status: number; response: Record<string, unknown> }>(
    '/horoscope/ashtakvarga',
    { params: { ...birthParams(input), planet } },
  );
  const raw = unwrap(data);

  // Response shape: { planet: string, ashtak_varga: { "aries": N, ... } }
  // or flat: { "aries": N, "taurus": N, ... }
  const scoresRaw =
    (raw['ashtak_varga'] as Record<string, number> | undefined) ??
    (raw['ashtakavarga'] as Record<string, number> | undefined) ??
    {};

  // Normalise keys to lowercase sign names
  const scores: Record<string, number> = {};
  for (const [k, v] of Object.entries(scoresRaw)) {
    scores[k.toLowerCase()] = Number(v);
  }

  // Fetch chart image (fresh, not cached)
  const chartImage = await getAshtakvargaChartImage(input, planet);

  return {
    planet: planet === 'total' ? 'Total' : planet,
    scores,
    chartImage,
  };
}

async function getAshtakvargaChartImage(
  input: BirthChartInput,
  planet: AshtakvargaPlanet,
): Promise<string | null> {
  try {
    const { data } = await client.get<string>('/horoscope/ashtakvarga-chart-image', {
      params: {
        ...birthParams(input),
        planet,
        style: 'south',
        color: '#5C6BC0',
        size: 300,
        font_size: 28,
        format: 'base64',
      },
      responseType: 'text',
    });
    return typeof data === 'string' && data.trim().startsWith('<') ? data : null;
  } catch (err) {
    logger.warn({ planet, err }, '[VedicAstro] ashtakvarga-chart-image failed');
    return null;
  }
}

// ── Divisional charts ─────────────────────────────────────────────────────────

export type DivisionalDiv =
  | 'D1' | 'D2' | 'D3' | 'D4' | 'D5' | 'D6' | 'D7' | 'D8' | 'D9' | 'D10'
  | 'D11' | 'D12' | 'D16' | 'D20' | 'D24' | 'D27' | 'D30' | 'D40' | 'D45' | 'D60';

export interface DivisionalChartData {
  div: string;
  planets: PlanetData[];       // planets in this divisional chart
  ascendant: string;           // ascendant sign in this chart
}

export async function getDivisionalChart(
  input: BirthChartInput,
  div: DivisionalDiv = 'D1',
): Promise<DivisionalChartData> {
  logger.debug({ div }, '[VedicAstro] fetching divisional chart');
  const { data } = await client.get<{ status: number; response: Record<string, unknown> }>(
    '/horoscope/divisional-charts',
    { params: { ...birthParams(input), div, response_type: 'planet_object' } },
  );
  const raw = unwrap(data);

  // response_type=planet_object: { "Sun": { zodiac, house, ... }, "Moon": {...}, ... }
  // Also has "Ascendant" key for ascendant sign
  const ascendant = String((raw['Ascendant'] as Record<string, unknown>)?.['zodiac'] ?? '');

  const planets: PlanetData[] = [];
  for (const [name, val] of Object.entries(raw)) {
    if (name === 'Ascendant') continue;
    const p = val as Record<string, unknown>;
    planets.push({
      name,
      fullDegree: Number(p['global_degree'] ?? p['full_degree'] ?? 0),
      normDegree: Number(p['local_degree'] ?? p['norm_degree'] ?? 0),
      speed: Number(p['speed'] ?? 0),
      isRetro: Boolean(p['retro'] ?? p['is_retro'] ?? false),
      sign: String(p['zodiac'] ?? p['sign'] ?? ''),
      signLord: String(p['zodiac_lord'] ?? p['sign_lord'] ?? ''),
      nakshatra: String(p['nakshatra'] ?? ''),
      nakshatraLord: String(p['nakshatra_lord'] ?? ''),
      nakshatraPada: Number(p['nakshatra_pada'] ?? 0),
      house: Number(p['house'] ?? 0),
    });
  }

  return { div, planets, ascendant };
}

// ── Dasha (full hierarchy) ────────────────────────────────────────────────────

export interface AntarDashaEntry {
  planet: string;       // Antar planet name
  endDate: string;      // ISO date string
}

export interface MahaDashaEntry {
  planet: string;       // Maha planet name
  startDate: string;    // ISO date string
  endDate: string;      // ISO date string
  antars: AntarDashaEntry[];
}

export interface SubDashaLevel {
  name: string;         // planet name
  start: string;        // ISO date
  end: string;          // ISO date
}

export interface SpecificSubDashaData {
  mahadasha: string;
  antardasha: string;
  paryantardasha: string;
  shookshamadasha: string;
  pranadasha: SubDashaLevel[];
}

// Parse dates like "Thu Jul 01 1999" → ISO date "1999-07-01"
function parseDashaDate(raw: string): string {
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    return d.toISOString().split('T')[0];
  } catch {
    return raw;
  }
}

export async function getFullDashaData(input: BirthChartInput): Promise<MahaDashaEntry[]> {
  const [mahaRaw, antarRaw] = await Promise.all([
    tryGetBirth<Record<string, unknown>>('/dashas/maha-dasha', input),
    tryGetBirth<Record<string, unknown>>('/dashas/antar-dasha', input),
  ]);

  if (!mahaRaw) return [];

  const mahaNames = (mahaRaw['mahadasha'] as string[]) ?? [];
  const mahaEndDates = (mahaRaw['mahadasha_order'] as string[]) ?? [];
  const dashaStartDate = parseDashaDate(String(mahaRaw['dasha_start_date'] ?? ''));

  const antarMat = (antarRaw?.['antardashas'] as string[][]) ?? [];
  const antarDates = (antarRaw?.['antardasha_order'] as string[][]) ?? [];

  return mahaNames.map((mahaPlanet, i) => {
    // Start date: first maha starts at dasha_start_date; subsequent start at prev maha end
    const startDate = i === 0 ? dashaStartDate : parseDashaDate(mahaEndDates[i - 1] ?? '');
    const endDate = parseDashaDate(mahaEndDates[i] ?? '');

    // Antardasha entries for this mahadasha
    const antarNames = antarMat[i] ?? [];
    const antarEndList = antarDates[i] ?? [];

    const antars: AntarDashaEntry[] = antarNames.map((pair, j) => {
      const antarPlanet = pair.includes('/') ? pair.split('/')[1] : pair;
      return {
        planet: antarPlanet,
        endDate: parseDashaDate(antarEndList[j] ?? ''),
      };
    });

    return { planet: mahaPlanet, startDate, endDate, antars };
  });
}

export async function getSpecificSubDasha(
  input: BirthChartInput,
  md: string,
  ad: string,
  pd: string,
  sd: string,
): Promise<SpecificSubDashaData | null> {
  try {
    const { data } = await client.get<{ status: number; response: Record<string, unknown> }>(
      '/dashas/specific-sub-dasha',
      { params: { ...birthParams(input), md, ad, pd, sd } },
    );
    const raw = unwrap(data);
    const pranadasha = (raw['pranadasha'] as Array<Record<string, unknown>>)?.map((p) => ({
      name: String(p['name'] ?? ''),
      start: parseDashaDate(String(p['start'] ?? '')),
      end: parseDashaDate(String(p['end'] ?? '')),
    })) ?? [];
    return {
      mahadasha:       String(raw['mahadasha'] ?? ''),
      antardasha:      String(raw['antardasha'] ?? ''),
      paryantardasha:  String(raw['paryantardasha'] ?? raw['pratyantardasha'] ?? ''),
      shookshamadasha: String(raw['Shookshamadasha'] ?? raw['shookshamadasha'] ?? ''),
      pranadasha,
    };
  } catch (err) {
    logger.warn({ md, ad, pd, sd, err }, '[VedicAstro] specific-sub-dasha failed');
    return null;
  }
}

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
  panchangDetails:   Record<string, unknown> | null;  // tithi, karan, yog, nakshatra, sunrise, sunset
  avakhadaDetails:   Record<string, unknown> | null;  // varna, vashya, yoni, gan, nadi, sign, signLord
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

async function getBirth<T>(endpoint: string, input: BirthChartInput, extra: Record<string, unknown> = {}): Promise<T> {
  logger.debug({ endpoint }, '[VedicAstro] fetching birth chart data');
  const { data } = await client.get<{ status: number; response: T }>(endpoint, {
    params: { ...birthParams(input), ...extra },
  });
  return unwrap(data);
}

// chart-image returns raw SVG bytes directly (not JSON)
async function getChartSvg(input: BirthChartInput, div: 'D1' | 'D9', style: 'north' | 'south'): Promise<string | null> {
  try {
    const { data } = await client.get<string>('/horoscope/chart-image', {
      params: { ...birthParams(input), div, style, format: 'base64', size: 300 },
      responseType: 'text',
    });
    // Returns raw SVG string (starts with <?xml or <svg)
    return typeof data === 'string' && data.trim().startsWith('<') ? data : null;
  } catch (err) {
    logger.warn({ div, err }, '[VedicAstro] chart-image failed');
    return null;
  }
}

// planet-details returns an indexed object { "0": {...}, "1": {...}, ... }
// Actual field names confirmed from API: zodiac, zodiac_lord, retro (not is_retro), local_degree, global_degree
function normalisePlanets(raw: Record<string, Record<string, unknown>>): PlanetData[] {
  return Object.values(raw).map((p) => ({
    name:          String(p['name'] ?? ''),
    fullDegree:    Number(p['global_degree'] ?? p['full_degree'] ?? 0),
    normDegree:    Number(p['local_degree'] ?? p['norm_degree'] ?? 0),
    speed:         Number(p['speed'] ?? 0),
    // API uses 'retro' boolean field (not 'is_retro')
    isRetro:       Boolean(p['retro'] ?? p['is_retro'] ?? false),
    sign:          String(p['zodiac'] ?? p['sign'] ?? ''),
    signLord:      String(p['zodiac_lord'] ?? p['sign_lord'] ?? ''),
    nakshatra:     String(p['nakshatra'] ?? ''),
    nakshatraLord: String(p['nakshatra_lord'] ?? ''),
    nakshatraPada: Number(p['nakshatra_pada'] ?? 0),
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

function normaliseAscendant(
  ascRaw: Record<string, unknown>,    // from /horoscope/ascendant-report  (response[0])
  kundliRaw: Record<string, unknown> | null, // from /extended-horoscope/extended-kundli-details
): FullKundliChartData['ascendant'] {
  // ascendant-report actual fields: ascendant, ascendant_lord (no nakshatra fields here)
  // extended-kundli-details has: ascendant_sign, ascendant_nakshatra, nakshatra, nakshatra_lord, nakshatra_pada
  return {
    sign:          String(ascRaw['ascendant'] ?? kundliRaw?.['ascendant_sign'] ?? ''),
    signLord:      String(ascRaw['ascendant_lord'] ?? ''),
    degree:        Number(ascRaw['degree'] ?? 0),
    nakshatra:     String(kundliRaw?.['ascendant_nakshatra'] ?? ascRaw['nakshatra'] ?? ''),
    nakshatraLord: String(kundliRaw?.['nakshatra_lord'] ?? ''),
    nakshatraPada: Number(kundliRaw?.['nakshatra_pada'] ?? 0),
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
  // ascendant-report returns an array — take the first element
  const [planetsRaw, ascArr] = await Promise.all([
    getBirth<Record<string, Record<string, unknown>>>('/horoscope/planet-details', input),
    getBirth<unknown[]>('/horoscope/ascendant-report', input),
  ]);
  const ascRaw = (Array.isArray(ascArr) ? (ascArr[0] ?? {}) : ascArr) as Record<string, unknown>;

  // Optional enrichment — failures don't block the report
  // NOTE: /horoscope/panchang-details and /horoscope/avakhada-details return 404.
  // All panchang + avakhada + nakshatra data comes from extended-kundli-details.
  // Chart images are fetched fresh per request and NOT persisted to the DB.
  const [
    majorDashaRaw, currentDashaRaw,
    mangalRaw, kaalSarpRaw,
    sadeSatiStatusRaw, pitraRaw,
    generalRaw,
    chartD1, chartD9,
  ] = await Promise.all([
    tryGetBirth<Record<string, unknown>>('/dashas/maha-dasha', input),
    tryGetBirth<Record<string, unknown>>('/dashas/current-mahadasha', input),
    tryGetBirth<Record<string, unknown>>('/dosha/mangal-dosh', input),
    tryGetBirth<Record<string, unknown>>('/dosha/kaalsarp-dosh', input),
    tryGetBirth<Record<string, unknown>>('/extended-horoscope/current-sade-sati', input),
    tryGetBirth<Record<string, unknown>>('/dosha/pitra-dosh', input),
    tryGetBirth<Record<string, unknown>>('/extended-horoscope/extended-kundli-details', input),
    getChartSvg(input, 'D1', 'north'),
    getChartSvg(input, 'D9', 'north'),
  ]);

  return {
    ascendant:         normaliseAscendant(ascRaw, generalRaw),
    planets:           normalisePlanets(planetsRaw),
    houseCusps:        normaliseHouseCusps([]),
    astroDetails:      ascRaw,
    // Both panchang and avakhada fields live inside extended-kundli-details response
    panchangDetails:   generalRaw ?? null,
    avakhadaDetails:   generalRaw ?? null,
    dasha:             majorDashaRaw ? normaliseDasha(majorDashaRaw) : [],
    currentDasha:      currentDashaRaw ?? null,
    mangalDosha:       mangalRaw ? normaliseMangal(mangalRaw) : null,
    kaalSarpDosha:     kaalSarpRaw ? normaliseKaalSarp(kaalSarpRaw) : null,
    sadeSatiStatus:    sadeSatiStatusRaw ?? null,
    sadeSatiLife:      null,
    pitraDosha:        pitraRaw ?? null,
    generalPrediction: generalRaw ? String(generalRaw['bot_response'] ?? '') || null : null,
    chartImageD1:      chartD1,
    chartImageD9:      chartD9,
    input,
    computedAt:        new Date().toISOString(),
  };
}

// ── Kundli matching (Ashtakoot / Guna Milan) ──────────────────────────────────

export interface KundliMatchBreakdown {
  varna:     { points: number; maxPoints: number; description: string };
  vashya:    { points: number; maxPoints: number; description: string };
  tara:      { points: number; maxPoints: number; description: string };
  yoni:      { points: number; maxPoints: number; description: string };
  graha:     { points: number; maxPoints: number; description: string };
  gana:      { points: number; maxPoints: number; description: string };
  bhakoot:   { points: number; maxPoints: number; description: string };
  nadi:      { points: number; maxPoints: number; description: string };
}

export interface KundliMatchResult {
  totalPoints:  number;    // out of 36
  maxPoints:    36;
  scoreLabel:   string;    // 'Excellent' | 'Good' | 'Average' | 'Poor'
  breakdown:    KundliMatchBreakdown;
  conclusion:   string;
  manglikBoy:   boolean;
  manglikGirl:  boolean;
}

function scoreLabel(points: number): string {
  if (points >= 28) return 'Excellent';
  if (points >= 21) return 'Good';
  if (points >= 18) return 'Average';
  return 'Poor';
}

function safeNum(v: unknown): number {
  return typeof v === 'number' ? v : Number(v ?? 0);
}

function koota(raw: Record<string, unknown>, key: string, max: number): { points: number; maxPoints: number; description: string } {
  const block = raw[key] as Record<string, unknown> | undefined;
  return {
    points:      safeNum(block?.['received_koot_points'] ?? block?.['points'] ?? block?.['score'] ?? 0),
    maxPoints:   max,
    description: String(block?.['description'] ?? block?.['bot_response'] ?? ''),
  };
}

export async function getKundliMatch(
  boy:  BirthChartInput,
  girl: BirthChartInput,
): Promise<KundliMatchResult> {
  logger.debug('[VedicAstro] fetching kundli match');

  // vedicastroapi uses separate boy/girl param prefixes
  const boyP  = birthParams(boy);
  const girlP = birthParams(girl);

  const params: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(boyP))  params[`m_${k}`]  = v;
  for (const [k, v] of Object.entries(girlP)) params[`f_${k}`]  = v;

  const { data } = await client.get<{ status: number; response: Record<string, unknown> }>(
    '/matching/ashtakoot-points',
    { params },
  );
  const raw = unwrap(data);

  const total = safeNum(raw['total_points'] ?? raw['totalPoints'] ?? raw['received_points'] ?? 0);

  const breakdown: KundliMatchBreakdown = {
    varna:   koota(raw, 'varna',   1),
    vashya:  koota(raw, 'vashya',  2),
    tara:    koota(raw, 'tara',    3),
    yoni:    koota(raw, 'yoni',    4),
    graha:   koota(raw, 'graha_maitri', 5),
    gana:    koota(raw, 'gana',    6),
    bhakoot: koota(raw, 'bhakoot', 7),
    nadi:    koota(raw, 'nadi',    8),
  };

  const manglikBoy  = Boolean((raw['manglik_boy']  as Record<string, unknown>)?.['is_manglik']  ?? raw['manglikBoy']);
  const manglikGirl = Boolean((raw['manglik_girl'] as Record<string, unknown>)?.['is_manglik']  ?? raw['manglikGirl']);

  return {
    totalPoints:  total,
    maxPoints:    36,
    scoreLabel:   scoreLabel(total),
    breakdown,
    conclusion:   String(raw['conclusion'] ?? raw['bot_response'] ?? ''),
    manglikBoy,
    manglikGirl,
  };
}
