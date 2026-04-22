// BullMQ worker that generates horoscopes for all 12 signs for a given period.
// Each job payload: { period: 'daily'|'weekly'|'monthly'|'yearly', periodKey: string, source: 'vedic_api'|'ai' }
// On success, inserts/updates rows and auto-publishes.
// Falls back from VedicAstroAPI to Claude AI if API call fails or is unconfigured.

import { Worker, type Job } from 'bullmq';
import { eq, and } from 'drizzle-orm';
import Anthropic from '@anthropic-ai/sdk';
import { redis } from '../../lib/redis.js';
import { db } from '../../db/client.js';
import { horoscopes } from '../../db/schema/content.js';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { reportError } from '../../observability/errorReporter.js';
import {
  getDailyHoroscope, getWeeklyHoroscope, getMonthlyHoroscope, getYearlyHoroscope,
  ZODIAC_SIGNS, type ZodiacSign, type VedicHoroscope,
} from '../../lib/vedicAstroClient.js';

export interface HoroscopeJobData {
  period: 'daily' | 'weekly' | 'monthly' | 'yearly';
  periodKey: string;
  source?: 'vedic_api' | 'ai';
}

// ── AI fallback (Claude) ──────────────────────────────────────────────────────

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

async function generateViaAI(sign: ZodiacSign, period: string, periodKey: string): Promise<VedicHoroscope> {
  const prompt = `You are a Vedic astrologer. Write a ${period} horoscope for ${sign} (${periodKey}).
Include: general prediction, love, career, health, wealth insights. Also give a lucky color, lucky number, and lucky day.
Respond ONLY with valid JSON matching this shape exactly:
{
  "general": "...",
  "love": "...",
  "career": "...",
  "health": "...",
  "wealth": "...",
  "luckyColor": "...",
  "luckyNumber": "...",
  "luckyDay": "..."
}`;

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 800,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '{}';
  const parsed = JSON.parse(text);
  return { sign, ...parsed };
}

// ── Fetch from VedicAstroAPI by period type ───────────────────────────────────

async function fetchVedic(sign: ZodiacSign, period: string): Promise<VedicHoroscope> {
  switch (period) {
    case 'daily':   return getDailyHoroscope(sign);
    case 'weekly':  return getWeeklyHoroscope(sign);
    case 'monthly': return getMonthlyHoroscope(sign);
    case 'yearly':  return getYearlyHoroscope(sign);
    default: throw new Error(`Unknown period: ${period}`);
  }
}

// ── Upsert one horoscope row ──────────────────────────────────────────────────

async function upsertHoroscope(h: VedicHoroscope, period: string, periodKey: string, source: string) {
  const existing = await db.query.horoscopes.findFirst({
    where: and(
      eq(horoscopes.sign, h.sign),
      eq(horoscopes.period, period),
      eq(horoscopes.periodKey, periodKey),
    ),
  });

  const sections = {
    general: h.general,
    love: h.love,
    career: h.career,
    health: h.health,
    wealth: h.wealth,
  };

  if (existing) {
    await db.update(horoscopes)
      .set({
        content: h.general,
        sections,
        luckyColor: h.luckyColor ?? null,
        luckyNumber: h.luckyNumber ?? null,
        luckyDay: h.luckyDay ?? null,
        source,
        generatedAt: new Date(),
        updatedAt: new Date(),
        // Auto-publish if not already manually unpublished (existing ones keep their state
        // unless this is a fresh insert — we publish on first generation)
      })
      .where(eq(horoscopes.id, existing.id));
  } else {
    await db.insert(horoscopes).values({
      sign: h.sign,
      period,
      periodKey,
      date: period === 'daily' ? periodKey : '',
      content: h.general,
      sections,
      luckyColor: h.luckyColor ?? null,
      luckyNumber: h.luckyNumber ?? null,
      luckyDay: h.luckyDay ?? null,
      source,
      isPublished: true,
      generatedAt: new Date(),
    });
  }
}

// ── Worker ─────────────────────────────────────────────────────────────────────

export function startHoroscopeWorker() {
  const useVedicApi = !!(env.VEDIC_ASTRO_API_USER_ID && env.VEDIC_ASTRO_API_KEY);

  const worker = new Worker<HoroscopeJobData>(
    'horoscopeGeneration',
    async (job: Job<HoroscopeJobData>) => {
      const { period, periodKey, source = useVedicApi ? 'vedic_api' : 'ai' } = job.data;
      logger.info({ period, periodKey, source }, '[HoroscopeWorker] starting generation');

      const results: string[] = [];

      for (const sign of ZODIAC_SIGNS) {
        try {
          let horoscope: VedicHoroscope;

          if (source === 'vedic_api' && useVedicApi) {
            try {
              horoscope = await fetchVedic(sign, period);
            } catch (apiErr) {
              logger.warn({ sign, period, err: apiErr }, '[HoroscopeWorker] VedicAstroAPI failed, falling back to AI');
              horoscope = await generateViaAI(sign, period, periodKey);
            }
          } else {
            horoscope = await generateViaAI(sign, period, periodKey);
          }

          await upsertHoroscope(horoscope, period, periodKey, source);
          results.push(sign);

          // Brief pause between signs to stay within API rate limits
          await new Promise((r) => setTimeout(r, 300));
        } catch (err) {
          logger.error({ sign, period, err }, '[HoroscopeWorker] failed for sign, continuing');
          await reportError({
            error: err as Error,
            source: 'bullmqJob',
            sourceDetail: `horoscopeGeneration.${period}`,
            severity: 'warning',
            metadata: { sign, period, periodKey },
          });
        }
      }

      logger.info({ period, periodKey, count: results.length }, '[HoroscopeWorker] completed');
      return { generated: results };
    },
    {
      connection: redis,
      concurrency: 1, // single-threaded to avoid API rate limits
    },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, '[HoroscopeWorker] job failed');
  });

  return worker;
}
