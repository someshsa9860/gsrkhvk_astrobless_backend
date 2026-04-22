import type { FastifyPluginAsync } from 'fastify';
import * as service from './content.service.js';
import { getSettingValue } from '../../admin/settings/adminSettings.service.js';

function todayKey(): string { return new Date().toISOString().slice(0, 10); }
function monthKey(): string { return new Date().toISOString().slice(0, 7); }
function yearKey(): string { return String(new Date().getFullYear()); }

function currentWeekKey(): string {
  const d = new Date();
  const dayNum = d.getDay() || 7;
  const adjusted = new Date(d);
  adjusted.setDate(adjusted.getDate() + 4 - dayNum);
  const yearStart = new Date(adjusted.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((adjusted.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${adjusted.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export const contentRoutes: FastifyPluginAsync = async (app) => {
  // Legacy daily route
  app.get('/v1/public/horoscope/:sign/:date', {
    schema: { tags: ['public:horoscope'], summary: 'Get daily horoscope for a zodiac sign on a specific date' },
    handler: async (req, reply) => {
      const { sign, date } = req.params as { sign: string; date: string };
      const data = await service.getDailyHoroscope(sign, date);
      return reply.send({ ok: true, data, traceId: req.requestContext.traceId });
    },
  });

  // Today's horoscope
  app.get('/v1/public/horoscopes/today/:sign', {
    schema: { tags: ['public:horoscope'], summary: "Get today's horoscope for a zodiac sign" },
    handler: async (req, reply) => {
      const { sign } = req.params as { sign: string };
      const data = await service.getDailyHoroscope(sign, todayKey());
      return reply.send({ ok: true, data, traceId: req.requestContext.traceId });
    },
  });

  // Weekly
  app.get('/v1/public/horoscopes/weekly/:sign', {
    schema: { tags: ['public:horoscope'], summary: 'Get weekly horoscope for a zodiac sign' },
    handler: async (req, reply) => {
      const { sign } = req.params as { sign: string };
      const data = await service.getHoroscopeByPeriod(sign, 'weekly', currentWeekKey());
      return reply.send({ ok: true, data, traceId: req.requestContext.traceId });
    },
  });

  // Monthly
  app.get('/v1/public/horoscopes/monthly/:sign', {
    schema: { tags: ['public:horoscope'], summary: 'Get monthly horoscope for a zodiac sign' },
    handler: async (req, reply) => {
      const { sign } = req.params as { sign: string };
      const data = await service.getHoroscopeByPeriod(sign, 'monthly', monthKey());
      return reply.send({ ok: true, data, traceId: req.requestContext.traceId });
    },
  });

  // Yearly
  app.get('/v1/public/horoscopes/yearly/:sign', {
    schema: { tags: ['public:horoscope'], summary: 'Get yearly horoscope for a zodiac sign' },
    handler: async (req, reply) => {
      const { sign } = req.params as { sign: string };
      const data = await service.getHoroscopeByPeriod(sign, 'yearly', yearKey());
      return reply.send({ ok: true, data, traceId: req.requestContext.traceId });
    },
  });

  // Signs list
  app.get('/v1/public/horoscope/signs', {
    schema: { tags: ['public:horoscope'], summary: 'List all zodiac signs' },
    handler: async (req, reply) => {
      const signs = await service.listHoroscopeSigns();
      return reply.send({ ok: true, data: { signs }, traceId: req.requestContext.traceId });
    },
  });

  // Theme config (no auth — consumed by both mobile apps on startup)
  app.get('/v1/public/settings/theme', {
    schema: { tags: ['public:settings'], summary: 'Get current brand theme colors' },
    handler: async (req, reply) => {
      const theme = await getSettingValue<Record<string, string>>('theme.config', {
        primary: '#5C6BC0',
        accent: '#FFB300',
        bgDark: '#0D0B1E',
        cardDark: '#1E1B3A',
        surfaceDark: '#231F54',
        borderDark: '#2D2A5E',
        success: '#4CAF50',
        error: '#F44336',
        textPrimary: '#ECEFF1',
        textSecondary: '#B0BEC5',
      });
      return reply.send({ ok: true, data: theme, traceId: req.requestContext.traceId });
    },
  });
};
