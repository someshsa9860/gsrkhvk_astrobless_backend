// Cron scheduler: wraps BullMQ repeatable jobs with audit trail via cronRuns.
// Register crons once at app startup; they are idempotent (BullMQ deduplicates by name).

import { Queue } from 'bullmq';
import { redis } from '../lib/redis.js';
import { prisma } from '../db/client.js';
import { horoscopeQueue, tempCleanupQueue } from './queues.js';
import { logger } from '../lib/logger.js';
import { reportError } from '../observability/errorReporter.js';
import { v4 as uuidv4 } from 'uuid';

// ── Period key helpers ────────────────────────────────────────────────────────

function dailyKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function weeklyKey(d = new Date()): string {
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
    const run = await prisma.cronRun.create({
      data: { jobName, status: 'running', startedAt, traceId },
    });
    runId = run.id;

    await fn();

    if (runId) {
      const durationMs = Date.now() - startedAt.getTime();
      await prisma.cronRun.update({
        where: { id: runId },
        data: { status: 'succeeded', finishedAt: new Date(), durationMs },
      });
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
      await prisma.cronRun.update({
        where: { id: runId },
        data: {
          status: 'failed',
          finishedAt: new Date(),
          durationMs: Date.now() - startedAt.getTime(),
          errorMessage: (err as Error).message,
        },
      });
    }
  }
}

// ── Horoscope cron handlers ───────────────────────────────────────────────────

async function triggerHoroscopeGeneration(period: 'daily' | 'weekly' | 'monthly' | 'yearly', periodKey: string) {
  await horoscopeQueue.add(
    `${period}-${periodKey}`,
    { period, periodKey },
    {
      jobId: `horoscope-${period}-${periodKey}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 60_000 },
    },
  );
  logger.info({ period, periodKey }, '[Scheduler] queued horoscope generation');
}

// ── BullMQ repeatable job registration ───────────────────────────────────────

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
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        await triggerHoroscopeGeneration('daily', dailyKey(tomorrow));
      });
    },
  },
  {
    name: 'horoscope.weekly',
    cron: '30 17 * * 0',
    handler: async () => {
      await withCronTracking('horoscope.weekly', async () => {
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
    cron: '0 17 1 * *',
    handler: async () => {
      await withCronTracking('horoscope.monthly', async () => {
        await triggerHoroscopeGeneration('monthly', monthlyKey());
      });
    },
  },
  {
    name: 'horoscope.yearly',
    cron: '0 17 1 1 *',
    handler: async () => {
      await withCronTracking('horoscope.yearly', async () => {
        await triggerHoroscopeGeneration('yearly', yearlyKey());
      });
    },
  },
  {
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
