import admin from 'firebase-admin';
import { env } from '../../config/env.js';
import { prisma } from '../../db/client.js';
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
  await prisma.fcmToken.upsert({
    where: { token },
    create: { ownerType, ownerId, token, platform },
    update: { lastSeenAt: new Date() },
  });
}

/**
 * Subscribe a device FCM token to a topic.
 * Topic should be the owner's ID (customerId or astrologerId).
 * Call this immediately after registering an FCM token on login.
 */
export async function subscribeToTopic(token: string, topic: string): Promise<void> {
  ensureFirebase();
  if (!firebaseInitialized) return;
  try {
    await admin.messaging().subscribeToTopic([token], topic);
    logger.debug({ topic, token: token.slice(-6) }, 'FCM topic subscribed');
  } catch (err) {
    logger.warn({ err, topic }, 'FCM topic subscribe failed');
  }
}

/**
 * Unsubscribe a device FCM token from a topic.
 * Call this on logout before clearing the FCM token.
 */
export async function unsubscribeFromTopic(token: string, topic: string): Promise<void> {
  ensureFirebase();
  if (!firebaseInitialized) return;
  try {
    await admin.messaging().unsubscribeFromTopic([token], topic);
    logger.debug({ topic, token: token.slice(-6) }, 'FCM topic unsubscribed');
  } catch (err) {
    logger.warn({ err, topic }, 'FCM topic unsubscribe failed');
  }
}

/**
 * Send a push notification to a topic (= ownerId).
 * Falls back to per-token delivery if no topic-based delivery is configured.
 * Topic-based delivery ensures all logged-in devices receive the notification
 * without querying the DB for FCM tokens.
 */
export async function sendPushToTopic(topic: string, title: string, body: string, data?: Record<string, string>): Promise<void> {
  ensureFirebase();
  if (!firebaseInitialized) return;
  try {
    await admin.messaging().send({
      topic,
      notification: { title, body },
      data,
      android: { priority: 'high' },
      apns: { payload: { aps: { sound: 'default', badge: 1 } } },
    });
    logger.debug({ topic }, 'FCM topic push sent');
  } catch (err) {
    logger.warn({ err, topic }, 'FCM topic push failed');
  }
}

/**
 * Send a push to a specific persona by ownerId.
 * Uses topic-based delivery (topic = ownerId) — no DB token lookup needed.
 */
export async function sendPush(ownerType: 'customer' | 'astrologer', ownerId: string, title: string, body: string, data?: Record<string, string>): Promise<void> {
  return sendPushToTopic(ownerId, title, body, data);
}

export async function createInAppNotification(
  recipientType: 'customer' | 'astrologer',
  recipientId: string,
  type: string,
  title: string,
  body?: string,
  data?: Record<string, unknown>,
): Promise<void> {
  await prisma.notification.create({
    data: { recipientType, recipientId, type, title, body: body ?? null, data: data ?? undefined },
  });
}
