import { prisma } from '../../db/client.js';
import type { Customer, Prisma } from '@prisma/client';

export async function findById(id: string): Promise<Customer | null> {
  return prisma.customer.findFirst({ where: { id } });
}

export async function update(id: string, data: Prisma.CustomerUpdateInput): Promise<Customer | null> {
  return prisma.customer.update({ where: { id }, data: { ...data, updatedAt: new Date() } });
}

export async function findByPhone(phone: string): Promise<Customer | null> {
  return prisma.customer.findFirst({ where: { phone } });
}
