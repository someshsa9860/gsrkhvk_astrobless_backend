import { eq } from 'drizzle-orm';
import admin from 'firebase-admin';
import { env } from '../../config/env.js';
import { db } from '../../db/client.js';
import { fcmTokens, notifications } from '../../db/schema/content.js';
import { logger } from '../../lib/logger.js';

let firebaseInitialized = false;

function ensureFirebase(): void {
  if (firebaseInitialized) return;
  if (!env.FCM_SERVICE_ACCOUNT_JSON) return;
  try {
    const serviceAccount = JSON.parse(env.FCM_SERVICE_ACCOUNT_JSON) as admin.ServiceAccount;
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    firebaseInitialized = true;
  } catch (err) {
    logger.error({ err }, 'Firebase init failed');
  }
}

export async function upsertFcmToken(ownerType: 'customer' | 'astrologer', ownerId: string, token: string, platform: 'ios' | 'android' | 'web'): Promise<void> {
  await db.insert(fcmTokens).values({ ownerType, ownerId, token, platform })
    .onConflictDoUpdate({ target: fcmTokens.token, set: { lastSeenAt: new Date() } });
}

export async function sendPush(ownerType: 'customer' | 'astrologer', ownerId: string, title: string, body: string, data?: Record<string, string>): Promise<void> {
  ensureFirebase();
  if (!firebaseInitialized) return;

  const tokens = await db.query.fcmTokens.findMany({ where: eq(fcmTokens.ownerId, ownerId), columns: { token: true } });
  if (!tokens.length) return;

  const messages: admin.messaging.Message[] = tokens.map((t) => ({
    token: t.token,
    notification: { title, body },
    data,
  }));

  const results = await admin.messaging().sendEach(messages);
  results.responses.forEach((r, i) => {
    if (r.error) logger.warn({ token: tokens[i]?.token?.slice(-6), err: r.error.message }, 'FCM send failed');
  });
}

export async function createInAppNotification(
  recipientType: 'customer' | 'astrologer',
  recipientId: string,
  type: string,
  title: string,
  body?: string,
  data?: Record<string, unknown>,
): Promise<void> {
  await db.insert(notifications).values({ recipientType, recipientId, type, title, body, data: data ?? null });
}
