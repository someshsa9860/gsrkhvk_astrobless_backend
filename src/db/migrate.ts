import * as dotenv from 'dotenv';
import { execSync } from 'child_process';

dotenv.config();

if (!process.env['DATABASE_URL']) {
  console.error('ERROR: DATABASE_URL is required');
  process.exit(1);
}

console.log('Running Prisma migrations...');
try {
  execSync('npx prisma migrate deploy', { stdio: 'inherit' });
  console.log('Migrations completed successfully');
} catch (err) {
  console.error('Migration failed:', err);
  process.exit(1);
}
