import { prisma } from '../client.js';

const INDIA_LANGUAGES = [
  { code: 'hi', name: 'Hindi',       nativeName: 'हिन्दी',      sortOrder: 1 },
  { code: 'en', name: 'English',     nativeName: 'English',      sortOrder: 2 },
  { code: 'ta', name: 'Tamil',       nativeName: 'தமிழ்',       sortOrder: 3 },
  { code: 'te', name: 'Telugu',      nativeName: 'తెలుగు',      sortOrder: 4 },
  { code: 'bn', name: 'Bengali',     nativeName: 'বাংলা',       sortOrder: 5 },
  { code: 'mr', name: 'Marathi',     nativeName: 'मराठी',       sortOrder: 6 },
  { code: 'gu', name: 'Gujarati',    nativeName: 'ગુજરાતી',     sortOrder: 7 },
  { code: 'kn', name: 'Kannada',     nativeName: 'ಕನ್ನಡ',       sortOrder: 8 },
  { code: 'ml', name: 'Malayalam',   nativeName: 'മലയാളം',     sortOrder: 9 },
  { code: 'pa', name: 'Punjabi',     nativeName: 'ਪੰਜਾਬੀ',     sortOrder: 10 },
  { code: 'or', name: 'Odia',        nativeName: 'ଓଡ଼ିଆ',       sortOrder: 11 },
  { code: 'as', name: 'Assamese',    nativeName: 'অসমীয়া',    sortOrder: 12 },
  { code: 'ur', name: 'Urdu',        nativeName: 'اردو',        sortOrder: 13 },
  { code: 'sa', name: 'Sanskrit',    nativeName: 'संस्कृतम्',   sortOrder: 14 },
  { code: 'mai', name: 'Maithili',   nativeName: 'मैथिली',      sortOrder: 15 },
  { code: 'kok', name: 'Konkani',    nativeName: 'कोंकणी',      sortOrder: 16 },
  { code: 'mni', name: 'Manipuri',   nativeName: 'মেইতেই',      sortOrder: 17 },
  { code: 'bho', name: 'Bhojpuri',   nativeName: 'भोजपुरी',     sortOrder: 18 },
  { code: 'raj', name: 'Rajasthani', nativeName: 'राजस्थानी',   sortOrder: 19 },
  { code: 'har', name: 'Haryanvi',   nativeName: 'हरियाणवी',    sortOrder: 20 },
];

const ASTROLOGY_SKILLS = [
  // Vedic Astrology
  { slug: 'vedic-astrology',      name: 'Vedic Astrology',       category: 'vedic',    sortOrder: 1 },
  { slug: 'kundli-reading',       name: 'Kundli Reading',         category: 'vedic',    sortOrder: 2 },
  { slug: 'kundli-matching',      name: 'Kundli Matching',        category: 'vedic',    sortOrder: 3 },
  { slug: 'birth-chart',          name: 'Birth Chart Analysis',   category: 'vedic',    sortOrder: 4 },
  { slug: 'nakshatra',            name: 'Nakshatra Reading',      category: 'vedic',    sortOrder: 5 },
  { slug: 'dasha-prediction',     name: 'Dasha Prediction',       category: 'vedic',    sortOrder: 6 },
  { slug: 'transit-reading',      name: 'Transit Reading',        category: 'vedic',    sortOrder: 7 },
  { slug: 'remedies',             name: 'Astrological Remedies',  category: 'vedic',    sortOrder: 8 },
  { slug: 'muhurta',              name: 'Muhurta (Auspicious Time)', category: 'vedic', sortOrder: 9 },
  { slug: 'prashna',              name: 'Prashna Kundli',         category: 'vedic',    sortOrder: 10 },
  // Life Areas
  { slug: 'love-marriage',        name: 'Love & Marriage',        category: 'life',     sortOrder: 11 },
  { slug: 'career-finance',       name: 'Career & Finance',       category: 'life',     sortOrder: 12 },
  { slug: 'health',               name: 'Health Astrology',       category: 'life',     sortOrder: 13 },
  { slug: 'education',            name: 'Education',              category: 'life',     sortOrder: 14 },
  { slug: 'child',                name: 'Child & Progeny',        category: 'life',     sortOrder: 15 },
  { slug: 'property',             name: 'Property & Real Estate', category: 'life',     sortOrder: 16 },
  { slug: 'foreign-travel',       name: 'Foreign Travel',         category: 'life',     sortOrder: 17 },
  { slug: 'relationship',         name: 'Relationship Guidance',  category: 'life',     sortOrder: 18 },
  // Divination
  { slug: 'tarot',                name: 'Tarot Reading',          category: 'divination', sortOrder: 19 },
  { slug: 'numerology',           name: 'Numerology',             category: 'divination', sortOrder: 20 },
  { slug: 'palmistry',            name: 'Palmistry',              category: 'divination', sortOrder: 21 },
  { slug: 'face-reading',         name: 'Face Reading',           category: 'divination', sortOrder: 22 },
  { slug: 'crystal-ball',         name: 'Crystal Ball Reading',   category: 'divination', sortOrder: 23 },
  { slug: 'angel-card',           name: 'Angel Card Reading',     category: 'divination', sortOrder: 24 },
  // Feng Shui / Vastu
  { slug: 'vastu',                name: 'Vastu Shastra',          category: 'vastu',    sortOrder: 25 },
  { slug: 'feng-shui',            name: 'Feng Shui',              category: 'vastu',    sortOrder: 26 },
  // Gemstones & Remedies
  { slug: 'gemstone',             name: 'Gemstone Recommendation', category: 'remedy',  sortOrder: 27 },
  { slug: 'rudraksha',            name: 'Rudraksha Guidance',     category: 'remedy',   sortOrder: 28 },
  { slug: 'yantra',               name: 'Yantra & Mantra',        category: 'remedy',   sortOrder: 29 },
  { slug: 'puja',                 name: 'Puja & Rituals',         category: 'remedy',   sortOrder: 30 },
  // Specialty Astrology
  { slug: 'western-astrology',    name: 'Western Astrology',      category: 'western',  sortOrder: 31 },
  { slug: 'chinese-astrology',    name: 'Chinese Astrology',      category: 'western',  sortOrder: 32 },
  { slug: 'nadi-astrology',       name: 'Nadi Astrology',         category: 'specialty', sortOrder: 33 },
  { slug: 'lal-kitab',            name: 'Lal Kitab',              category: 'specialty', sortOrder: 34 },
  { slug: 'kp-system',            name: 'KP System',              category: 'specialty', sortOrder: 35 },
  { slug: 'jaimini-astrology',    name: 'Jaimini Astrology',      category: 'specialty', sortOrder: 36 },
];

export async function seedLanguagesAndSkills() {
  console.log('Seeding languages...');
  for (const lang of INDIA_LANGUAGES) {
    await prisma.language.upsert({
      where: { code: lang.code },
      update: { name: lang.name, nativeName: lang.nativeName, sortOrder: lang.sortOrder },
      create: { ...lang, isActive: true },
    });
  }
  console.log(`✓ ${INDIA_LANGUAGES.length} languages seeded`);

  console.log('Seeding skills...');
  for (const skill of ASTROLOGY_SKILLS) {
    await prisma.skill.upsert({
      where: { slug: skill.slug },
      update: { name: skill.name, category: skill.category, sortOrder: skill.sortOrder },
      create: { ...skill, isActive: true },
    });
  }
  console.log(`✓ ${ASTROLOGY_SKILLS.length} skills seeded`);
}
