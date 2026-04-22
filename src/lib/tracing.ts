import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import { SERVICE_NAME } from '../config/constants.js';

export const tracer = trace.getTracer(SERVICE_NAME, '1.0.0');

export function startActiveSpan<T>(name: string, fn: () => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    try {
      const result = await fn();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw err;
    } finally {
      span.end();
    }
  });
}
