import { prisma } from '../../db/client.js';
import { AppError } from '../../lib/errors.js';
import { writeAuditLog } from '../../observability/auditLogger.js';
import type { z } from 'zod';
import type { CreateAddressSchema, UpdateAddressSchema } from './addresses.schema.js';

export async function listAddresses(customerId: string) {
  return prisma.customerAddress.findMany({
    where: { customerId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });
}

export async function getAddress(customerId: string, addressId: string) {
  const address = await prisma.customerAddress.findFirst({
    where: { id: addressId, customerId },
  });
  if (!address) throw new AppError('NOT_FOUND', 'Address not found.', 404);
  return address;
}

export async function createAddress(customerId: string, data: z.infer<typeof CreateAddressSchema>) {
  return prisma.$transaction(async (tx) => {
    if (data.isDefault) {
      await tx.customerAddress.updateMany({
        where: { customerId, isDefault: true },
        data: { isDefault: false },
      });
    }
    const address = await tx.customerAddress.create({
      data: {
        customerId,
        label: data.label ?? 'Home',
        name: data.name,
        phone: data.phone,
        line1: data.line1,
        line2: data.line2 ?? null,
        city: data.city,
        state: data.state,
        country: data.country,
        pincode: data.pincode,
        isDefault: data.isDefault ?? false,
      },
    });
    await writeAuditLog({
      actorType: 'customer',
      actorId: customerId,
      action: 'customer.addAddress',
      targetType: 'customerAddress',
      targetId: address.id,
      summary: `Customer added address: ${data.line1}, ${data.city}`,
    });
    return address;
  });
}

export async function updateAddress(
  customerId: string,
  addressId: string,
  data: z.infer<typeof UpdateAddressSchema>,
) {
  const existing = await prisma.customerAddress.findFirst({ where: { id: addressId, customerId } });
  if (!existing) throw new AppError('NOT_FOUND', 'Address not found.', 404);

  return prisma.$transaction(async (tx) => {
    if (data.isDefault) {
      await tx.customerAddress.updateMany({
        where: { customerId, isDefault: true, id: { not: addressId } },
        data: { isDefault: false },
      });
    }
    const updated = await tx.customerAddress.update({
      where: { id: addressId },
      data: {
        ...(data.label !== undefined ? { label: data.label } : {}),
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.line1 !== undefined ? { line1: data.line1 } : {}),
        ...(data.line2 !== undefined ? { line2: data.line2 } : {}),
        ...(data.city !== undefined ? { city: data.city } : {}),
        ...(data.state !== undefined ? { state: data.state } : {}),
        ...(data.country !== undefined ? { country: data.country } : {}),
        ...(data.pincode !== undefined ? { pincode: data.pincode } : {}),
        ...(data.isDefault !== undefined ? { isDefault: data.isDefault } : {}),
      },
    });
    await writeAuditLog({
      actorType: 'customer',
      actorId: customerId,
      action: 'customer.updateAddress',
      targetType: 'customerAddress',
      targetId: addressId,
      summary: `Customer updated address`,
      beforeState: { city: existing.city, isDefault: existing.isDefault },
      afterState: { city: updated.city, isDefault: updated.isDefault },
    });
    return updated;
  });
}

export async function deleteAddress(customerId: string, addressId: string) {
  const existing = await prisma.customerAddress.findFirst({ where: { id: addressId, customerId } });
  if (!existing) throw new AppError('NOT_FOUND', 'Address not found.', 404);

  await prisma.customerAddress.delete({ where: { id: addressId } });
  await writeAuditLog({
    actorType: 'customer',
    actorId: customerId,
    action: 'customer.deleteAddress',
    targetType: 'customerAddress',
    targetId: addressId,
    summary: `Customer deleted address: ${existing.line1}, ${existing.city}`,
  });
}

export async function setDefaultAddress(customerId: string, addressId: string) {
  const existing = await prisma.customerAddress.findFirst({ where: { id: addressId, customerId } });
  if (!existing) throw new AppError('NOT_FOUND', 'Address not found.', 404);

  await prisma.$transaction(async (tx) => {
    await tx.customerAddress.updateMany({
      where: { customerId, isDefault: true },
      data: { isDefault: false },
    });
    await tx.customerAddress.update({ where: { id: addressId }, data: { isDefault: true } });
  });
}
