import * as repo from './customers.repository.js';
import { AppError } from '../../lib/errors.js';
import { writeAuditLog } from '../../observability/auditLogger.js';
import type { Customer } from '@prisma/client';
import type { z } from 'zod';
import type { UpdateProfileSchema } from './customers.schema.js';

export async function getProfile(customerId: string): Promise<Customer> {
  const customer = await repo.findById(customerId);
  if (!customer) throw new AppError('NOT_FOUND', 'Customer not found.', 404);
  return customer;
}

export async function updateProfile(customerId: string, data: z.infer<typeof UpdateProfileSchema>): Promise<Customer> {
  const before = await repo.findById(customerId);
  if (!before) throw new AppError('NOT_FOUND', 'Customer not found.', 404);

  const updated = await repo.update(customerId, data);
  if (!updated) throw new AppError('INTERNAL', 'Update failed.', 500);

  await writeAuditLog({
    actorType: 'customer',
    actorId: customerId,
    action: 'customer.updateProfile',
    targetType: 'customer',
    targetId: customerId,
    summary: 'Customer updated profile',
    beforeState: { name: before.name, gender: before.gender },
    afterState: { name: updated.name, gender: updated.gender },
  });

  return updated;
}
