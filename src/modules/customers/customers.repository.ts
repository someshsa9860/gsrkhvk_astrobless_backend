import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { customers } from '../../db/schema/customers.js';
import type { Customer } from '../../db/schema/customers.js';

export async function findById(id: string): Promise<Customer | undefined> {
  return db.query.customers.findFirst({ where: eq(customers.id, id) });
}

export async function update(id: string, data: Partial<typeof customers.$inferInsert>): Promise<Customer | undefined> {
  const [updated] = await db.update(customers).set({ ...data, updatedAt: new Date() }).where(eq(customers.id, id)).returning();
  return updated;
}

export async function findByPhone(phone: string): Promise<Customer | undefined> {
  return db.query.customers.findFirst({ where: eq(customers.phone, phone) });
}
