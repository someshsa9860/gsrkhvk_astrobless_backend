import client from 'prom-client';
import { METRICS_PREFIX } from '../config/constants.js';

client.collectDefaultMetrics({ prefix: METRICS_PREFIX });

export const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status', 'audience'],
});

export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'route'],
  buckets: [0.01, 0.05, 0.08, 0.1, 0.2, 0.3, 0.5, 1, 2, 5],
});

export const httpInFlight = new client.Gauge({
  name: 'http_in_flight_requests',
  help: 'In-flight HTTP requests',
});

export const systemErrorsTotal = new client.Counter({
  name: 'system_errors_total',
  help: 'Total system errors',
  labelNames: ['severity', 'source'],
});

export const walletTopupTotal = new client.Counter({
  name: 'wallet_topup_total',
  help: 'Wallet top-ups',
  labelNames: ['provider', 'status'],
});

export const consultationActive = new client.Gauge({
  name: 'consultation_active',
  help: 'Active consultations',
});

export const consultationDuration = new client.Histogram({
  name: 'consultation_duration_seconds',
  help: 'Consultation duration',
  buckets: [60, 300, 600, 1800, 3600],
});

export const astrologerOnline = new client.Gauge({
  name: 'astrologer_online',
  help: 'Online astrologers',
});

export const registry = client.register;
