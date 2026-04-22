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
