import { pgTable, uuid, text, bigint, boolean, integer, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { customers } from './customers';
import { paymentOrders } from './wallet';

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  sku: text('sku').unique().notNull(),
  title: text('title').notNull(),
  description: text('description'),
  pricePaise: bigint('pricePaise', { mode: 'bigint' }).notNull(),
  category: text('category'),
  images: text('images').array().notNull().default([]),
  stock: integer('stock').notNull().default(0),
  isActive: boolean('isActive').notNull().default(true),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
});

export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customerId').notNull().references(() => customers.id),
  totalPaise: bigint('totalPaise', { mode: 'bigint' }).notNull(),
  status: text('status').notNull(), // pending | confirmed | shipped | delivered | cancelled
  shippingAddress: jsonb('shippingAddress'),
  paymentOrderId: uuid('paymentOrderId').references(() => paymentOrders.id),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
});

export const orderItems = pgTable('orderItems', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('orderId').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  productId: uuid('productId').notNull().references(() => products.id),
  qty: integer('qty').notNull(),
  pricePaise: bigint('pricePaise', { mode: 'bigint' }).notNull(),
});

export type Product = typeof products.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
