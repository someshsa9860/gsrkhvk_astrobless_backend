// Reusable pagination/sort/filter schema and helpers shared by every admin list endpoint.

import { z } from 'zod';

// ── Base list query schema ────────────────────────────────────────────────────

export const ListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().describe('1-based page number (default: 1)'),
  limit: z.coerce.number().int().min(1).max(100).optional().describe('Results per page (max 100, default: 20)'),
  sort: z.string().optional().describe("Column to sort by; prefix '-' for descending. E.g. '-createdAt'"),
  search: z.string().optional().describe('Free-text search applied per resource'),
  from: z.string().datetime().optional().describe('ISO 8601 lower bound on createdAt'),
  to: z.string().datetime().optional().describe('ISO 8601 upper bound on createdAt'),
});

export type ListQuery = z.infer<typeof ListQuerySchema>;

// ── Paged result envelope returned by every list service method ───────────────

export interface PagedResult<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ── Derive SQL offset+limit from a ListQuery ──────────────────────────────────

export function paginationFrom(q: ListQuery): { offset: number; limit: number } {
  const page = q.page ?? 1;
  const limit = q.limit ?? 20;
  return {
    offset: (page - 1) * limit,
    limit,
  };
}

// ── Wrap items + count into a PagedResult ─────────────────────────────────────

export function toPagedResult<T>(items: T[], total: number, q: ListQuery): PagedResult<T> {
  const page = q.page ?? 1;
  const limit = q.limit ?? 20;
  return {
    items,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}
