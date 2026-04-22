import { eq, and } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { horoscopes } from '../../db/schema/content.js';
import { AppError } from '../../lib/errors.js';

export async function getDailyHoroscope(sign: string, date: string) {
  // Try new period-based lookup first, fall back to legacy date column.
  const horoscope = await db.query.horoscopes.findFirst({
    where: and(
      eq(horoscopes.sign, sign.toLowerCase()),
      eq(horoscopes.period, 'daily'),
      eq(horoscopes.periodKey, date),
      eq(horoscopes.isPublished, true),
    ),
  });
  if (!horoscope) throw new AppError('NOT_FOUND', `No horoscope found for ${sign} on ${date}.`, 404);
  return horoscope;
}

export async function getHoroscopeByPeriod(sign: string, period: string, periodKey: string) {
  const horoscope = await db.query.horoscopes.findFirst({
    where: and(
      eq(horoscopes.sign, sign.toLowerCase()),
      eq(horoscopes.period, period),
      eq(horoscopes.periodKey, periodKey),
      eq(horoscopes.isPublished, true),
    ),
  });
  if (!horoscope) {
    throw new AppError('NOT_FOUND', `No ${period} horoscope found for ${sign} (${periodKey}).`, 404);
  }
  return horoscope;
}

export async function listHoroscopeSigns(): Promise<string[]> {
  return ['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'];
}
