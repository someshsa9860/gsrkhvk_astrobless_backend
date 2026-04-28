import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../db/client.js';
import { AppError } from '../../lib/errors.js';
import { writeAuditLog } from '../../observability/auditLogger.js';
import type {
  ProductListQuery, CreateProductInput, UpdateProductInput, RestockInput,
  OrderListQuery, UpdateOrderStatusInput, OrderRefundInput,
} from './adminAstroMall.schema.js';

// ── Products ──────────────────────────────────────────────────────────────────

export async function listProducts(q: ProductListQuery) {
  const limit  = q.limit ?? 20;
  const offset = ((q.page ?? 1) - 1) * limit;
  const where: Record<string, unknown> = {};
  if (q.category)              where['category'] = q.category;
  if (q.isActive !== undefined) where['isActive'] = q.isActive;
  if (q.inStock !== undefined)  where['stock']    = q.inStock ? { gt: 0 } : 0;
  if (q.search)                where['title']    = { contains: q.search, mode: 'insensitive' };

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    }),
    prisma.product.count({ where }),
  ]);
  return { items, page: q.page ?? 1, limit, total, totalPages: Math.ceil(total / limit) };
}

export async function getProduct(id: string) {
  const row = await prisma.product.findFirst({
    where: { id },
    include: { orderItems: { include: { order: true }, take: 5, orderBy: { order: { createdAt: 'desc' } } } },
  });
  if (!row) throw new AppError('NOT_FOUND', `Product ${id} not found.`, 404);
  return row;
}

export async function createProduct(actorId: string, input: CreateProductInput) {
  const existing = await prisma.product.findFirst({ where: { sku: input.sku } });
  if (existing) throw new AppError('VALIDATION', `SKU "${input.sku}" already in use.`, 400);

  const row = await prisma.product.create({
    data: {
      sku:         input.sku,
      title:       input.title,
      description: input.description,
      price:       input.price,
      category:    input.category,
      imageKeys:   input.imageKeys  ?? [],
      stock:       input.stock      ?? 0,
      isActive:    input.isActive   ?? true,
    },
  });
  await writeAuditLog({
    actorType: 'admin', actorId,
    action: 'product.create',
    targetType: 'product', targetId: row.id,
    summary: `Created product "${row.title}" (SKU: ${row.sku})`,
    afterState: row,
  });
  return row;
}

export async function updateProduct(actorId: string, id: string, input: UpdateProductInput) {
  const before = await getProduct(id);
  const row = await prisma.product.update({ where: { id }, data: input });
  await writeAuditLog({
    actorType: 'admin', actorId,
    action: 'product.update',
    targetType: 'product', targetId: id,
    summary: `Updated product "${row.title}"`,
    beforeState: { title: before.title, price: before.price, stock: before.stock, isActive: before.isActive },
    afterState:  { title: row.title,   price: row.price,   stock: row.stock,   isActive: row.isActive },
  });
  return row;
}

export async function deleteProduct(actorId: string, id: string) {
  const before = await getProduct(id);
  await prisma.product.update({ where: { id }, data: { isActive: false } });
  await writeAuditLog({
    actorType: 'admin', actorId,
    action: 'product.delete',
    targetType: 'product', targetId: id,
    summary: `Deactivated product "${before.title}"`,
    beforeState: { isActive: true },
    afterState:  { isActive: false },
  });
}

export async function restockProduct(actorId: string, id: string, input: RestockInput) {
  const before = await getProduct(id);
  const row = await prisma.product.update({
    where: { id },
    data: { stock: { increment: input.qty } },
  });
  await writeAuditLog({
    actorType: 'admin', actorId,
    action: 'product.restock',
    targetType: 'product', targetId: id,
    summary: `Restocked "${before.title}" +${input.qty} units${input.reason ? ` (${input.reason})` : ''}`,
    beforeState: { stock: before.stock },
    afterState:  { stock: row.stock },
  });
  return row;
}

// ── Orders ────────────────────────────────────────────────────────────────────

export async function listOrders(q: OrderListQuery) {
  const limit  = q.limit ?? 20;
  const offset = ((q.page ?? 1) - 1) * limit;
  const where: Record<string, unknown> = {};
  if (q.status)     where['status']     = q.status;
  if (q.customerId) where['customerId'] = q.customerId;
  if (q.from || q.to) {
    where['createdAt'] = {
      ...(q.from ? { gte: new Date(q.from) } : {}),
      ...(q.to   ? { lte: new Date(q.to)   } : {}),
    };
  }

  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        items:    { include: { product: { select: { id: true, title: true, sku: true } } } },
      },
    }),
    prisma.order.count({ where }),
  ]);
  return { items, page: q.page ?? 1, limit, total, totalPages: Math.ceil(total / limit) };
}

export async function getOrder(id: string) {
  const row = await prisma.order.findFirst({
    where: { id },
    include: {
      customer: { select: { id: true, name: true, phone: true, email: true } },
      items:    { include: { product: true } },
      paymentOrder: { select: { id: true, status: true, providerKey: true, providerOrderId: true } },
    },
  });
  if (!row) throw new AppError('NOT_FOUND', `Order ${id} not found.`, 404);
  return row;
}

export async function updateOrderStatus(actorId: string, id: string, input: UpdateOrderStatusInput) {
  const before = await getOrder(id);
  const row = await prisma.order.update({
    where: { id },
    data: { status: input.status, updatedAt: new Date() },
  });
  await writeAuditLog({
    actorType: 'admin', actorId,
    action: 'order.statusUpdate',
    targetType: 'order', targetId: id,
    summary: `Order status changed: ${before.status} → ${input.status}${input.note ? ` (${input.note})` : ''}${input.trackingNumber ? ` tracking: ${input.trackingNumber}` : ''}`,
    beforeState: { status: before.status },
    afterState:  { status: input.status, trackingNumber: input.trackingNumber, note: input.note },
  });
  return row;
}

export async function refundOrder(actorId: string, id: string, input: OrderRefundInput) {
  const order = await getOrder(id);
  if (input.amount > order.total) {
    throw new AppError('VALIDATION', 'Refund amount exceeds order total.', 400);
  }

  const wallet = await prisma.wallet.findFirst({ where: { customerId: order.customerId } });
  if (!wallet) throw new AppError('NOT_FOUND', 'Customer wallet not found.', 404);

  const newBalance = wallet.balance + input.amount;

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.order.update({
      where: { id },
      data: { status: 'cancelled', updatedAt: new Date() },
    });

    await tx.wallet.update({
      where: { id: wallet.id },
      data: { balance: newBalance, updatedAt: new Date() },
    });

    await tx.walletTransaction.create({
      data: {
        walletId:      wallet.id,
        customerId:    order.customerId,
        type:          'REFUND',
        direction:     'CREDIT',
        amount:        input.amount,
        balanceAfter:  newBalance,
        referenceType: 'orderRefund',
        referenceId:   id,
        idempotencyKey: uuidv4(),
        notes:         input.reason,
      },
    });

    await writeAuditLog(
      {
        actorType: 'admin', actorId,
        action: 'order.refund',
        targetType: 'order', targetId: id,
        summary: `Refunded ₹${input.amount.toFixed(2)} for order — ${input.reason}`,
        beforeState: { status: order.status, walletBalance: wallet.balance },
        afterState:  { status: 'cancelled', walletBalance: newBalance, refundAmount: input.amount },
      },
      tx,
    );

    return updated;
  });

  return result;
}
