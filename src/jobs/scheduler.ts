// Cron scheduler: wraps BullMQ repeatable jobs with audit trail via cronRuns.
// Register crons once at app startup; they are idempotent (BullMQ deduplicates by name).

import { Queue } from 'bullmq';
import { eq } from 'drizzle-orm';
import { redis } from '../lib/redis.js';
import { db } from '../db/client.js';
import { cronRuns } from '../db/schema/adminExtras.js';
import { horoscopeQueue, tempCleanupQueue } from './queues.js';
import { logger } from '../lib/logger.js';
import { reportError } from '../observability/errorReporter.js';
import { v4 as uuidv4 } from 'uuid';

// ── Period key helpers ────────────────────────────────────────────────────────

function dailyKey(d = new Date()): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function weeklyKey(d = new Date()): string {
  // ISO week: YYYY-WNN
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function monthlyKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function yearlyKey(d = new Date()): string {
  return String(d.getFullYear());
}

// ── CronRun tracking ──────────────────────────────────────────────────────────

async function withCronTracking(jobName: string, fn: () => Promise<void>): Promise<void> {
  const traceId = uuidv4();
  const startedAt = new Date();
  let runId: string | undefined;

  try {
    const [row] = await db.insert(cronRuns).values({
      jobName,
      status: 'running',
      startedAt,
      traceId,
    }).returning({ id: cronRuns.id });
    runId = row.id;

    await fn();

    if (runId) {
      const durationMs = Date.now() - startedAt.getTime();
      await db.update(cronRuns)
        .set({ status: 'succeeded', finishedAt: new Date(), durationMs })
        .where(eq(cronRuns.id, runId!));
    }
  } catch (err) {
    logger.error({ jobName, err }, '[Scheduler] cron job failed');
    await reportError({
      error: err as Error,
      source: 'scheduledTask',
      sourceDetail: jobName,
      severity: 'error',
      metadata: { jobName, traceId },
    });

    if (runId) {
      await db.update(cronRuns)
        .set({
          status: 'failed',
          finishedAt: new Date(),
          durationMs: Date.now() - startedAt.getTime(),
          errorMessage: (err as Error).message,
        })
        .where(eq(cronRuns.id, runId!));
    }
  }
}

// ── Horoscope cron handlers ───────────────────────────────────────────────────

async function triggerHoroscopeGeneration(period: 'daily' | 'weekly' | 'monthly' | 'yearly', periodKey: string) {
  await horoscopeQueue.add(
    `${period}-${periodKey}`,
    { period, periodKey },
    {
      jobId: `horoscope-${period}-${periodKey}`, // deduplicate
      attempts: 3,
      backoff: { type: 'exponential', delay: 60_000 },
    },
  );
  logger.info({ period, periodKey }, '[Scheduler] queued horoscope generation');
}

// ── BullMQ repeatable job registration ───────────────────────────────────────
// Cron expressions are in UTC. IST = UTC+5:30.
// Daily: 17:00 UTC = 22:30 IST (generates for next day)
// Weekly: every Monday 17:30 UTC = 23:00 IST Sunday (generates for the new week)
// Monthly: 1st of month 17:00 UTC (generates for the new month)
// Yearly: Jan 1st 17:00 UTC (generates for the new year)

const CRON_JOBS: Array<{
  name: string;
  cron: string;
  handler: () => Promise<void>;
}> = [
  {
    name: 'horoscope.daily',
    cron: '0 17 * * *',
    handler: async () => {
      await withCronTracking('horoscope.daily', async () => {
        // Generate for tomorrow
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        await triggerHoroscopeGeneration('daily', dailyKey(tomorrow));
      });
    },
  },
  {
    name: 'horoscope.weekly',
    cron: '30 17 * * 0', // Sunday 17:30 UTC → Monday IST
    handler: async () => {
      await withCronTracking('horoscope.weekly', async () => {
        // Generate for next week (Monday)
        const nextMonday = new Date();
        const day = nextMonday.getDay();
        const daysUntilMonday = day === 0 ? 1 : 8 - day;
        nextMonday.setDate(nextMonday.getDate() + daysUntilMonday);
        await triggerHoroscopeGeneration('weekly', weeklyKey(nextMonday));
      });
    },
  },
  {
    name: 'horoscope.monthly',
    cron: '0 17 1 * *', // 1st of every month
    handler: async () => {
      await withCronTracking('horoscope.monthly', async () => {
        await triggerHoroscopeGeneration('monthly', monthlyKey());
      });
    },
  },
  {
    name: 'horoscope.yearly',
    cron: '0 17 1 1 *', // Jan 1st
    handler: async () => {
      await withCronTracking('horoscope.yearly', async () => {
        await triggerHoroscopeGeneration('yearly', yearlyKey());
      });
    },
  },
  {
    // Weekly temp file cleanup: Sunday 02:00 UTC
    name: 'tempCleanup.weekly',
    cron: '0 2 * * 0',
    handler: async () => {
      await withCronTracking('tempCleanup.weekly', async () => {
        await tempCleanupQueue.add(
          'cleanup',
          {},
          {
            jobId: `tempCleanup-${weeklyKey()}`,
            attempts: 3,
            backoff: { type: 'exponential', delay: 60_000 },
          },
        );
        logger.info('[Scheduler] queued temp file cleanup');
      });
    },
  },
];

// ── Setup: register repeatable jobs using a dedicated scheduler queue ─────────

const schedulerQueue = new Queue('__scheduler__', { connection: redis });

export async function setupScheduler() {
  for (const job of CRON_JOBS) {
    await schedulerQueue.upsertJobScheduler(
      job.name,
      { pattern: job.cron },
      { name: job.name, data: { handlerKey: job.name } },
    );
    logger.info({ name: job.name, cron: job.cron }, '[Scheduler] registered cron');
  }

  logger.info('[Scheduler] all cron jobs registered');
}

// ── Manual trigger: used by admin "Run Now" endpoint ─────────────────────────

export async function runCronNow(jobName: string): Promise<void> {
  const job = CRON_JOBS.find((j) => j.name === jobName);
  if (!job) throw new Error(`Unknown cron job: ${jobName}`);
  await job.handler();
}

export { dailyKey, weeklyKey, monthlyKey, yearlyKey };
