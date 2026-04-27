import { getSocketServer } from './chat.gateway.js';
import { prisma } from '../../db/client.js';

let metricsInterval: NodeJS.Timeout | null = null;

export function startAdminMetricsEmitter(): void {
  if (metricsInterval) return;

  metricsInterval = setInterval(async () => {
    try {
      const io = getSocketServer();
      if (!io) return;

      const adminNs = io.of('/admin/dashboard');

      // Fetch live metrics
      const activeConsultations = await prisma.consultation.count({
        where: { status: 'active' },
      });

      const onlineAstrologers = await prisma.astrologer.count({
        where: { isOnline: true },
      });

      const todayRevenue = await prisma.walletTransaction.aggregate({
        where: {
          type: 'CONSULTATION_DEBIT',
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
        _sum: { amount: true },
      });

      const todaySignups = await prisma.customer.count({
        where: {
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
      });

      const errorCount = await prisma.systemError.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
        },
      });

      // Emit to all connected admins
      adminNs.emit('metrics:tick', {
        activeConsultationsNow: activeConsultations,
        astrologersOnlineNow: onlineAstrologers,
        revenueToday: todayRevenue._sum.amount || 0,
        newSignupsToday: todaySignups,
        errorsLast24h: errorCount,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Admin metrics emitter error:', err);
    }
  }, 5000); // Emit every 5 seconds
}

export function stopAdminMetricsEmitter(): void {
  if (metricsInterval) {
    clearInterval(metricsInterval);
    metricsInterval = null;
  }
}
