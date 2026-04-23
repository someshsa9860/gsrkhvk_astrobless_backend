import * as dotenv from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import path from 'path';
import postgres from 'postgres';

dotenv.config();

const DATABASE_URL = process.env['DATABASE_URL'];
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is required');
  process.exit(1);
}

async function runMigrations(): Promise<void> {
  const sql = postgres(DATABASE_URL!, { max: 1 });
  const db = drizzle(sql);

  const migrationsFolder = path.resolve(__dirname, '../../migrations');
  console.log(`Running migrations from: ${migrationsFolder}`);

  await migrate(db, { migrationsFolder });
  console.log('Migrations completed successfully');

  await sql.end();
}

runMigrations().catch((err: unknown) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
