import { prisma } from '../../db/client.js';
import { AppError } from '../../lib/errors.js';

export async function getDailyHoroscope(sign: string, date: string) {
  const horoscope = await prisma.horoscope.findFirst({
    where: {
      sign: sign.toLowerCase(),
      period: 'daily',
      periodKey: date,
      isPublished: true,
    },
  });
  if (!horoscope) throw new AppError('NOT_FOUND', `No horoscope found for ${sign} on ${date}.`, 404);
  return horoscope;
}

export async function getHoroscopeByPeriod(sign: string, period: string, periodKey: string) {
  const horoscope = await prisma.horoscope.findFirst({
    where: {
      sign: sign.toLowerCase(),
      period,
      periodKey,
      isPublished: true,
    },
  });
  if (!horoscope) {
    throw new AppError('NOT_FOUND', `No ${period} horoscope found for ${sign} (${periodKey}).`, 404);
  }
  return horoscope;
}

export async function listHoroscopeSigns(): Promise<string[]> {
  return ['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'];
}
