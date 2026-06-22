import { Pool } from 'pg'

export const db = new Pool({
  connectionString: process.env.PG_URL ?? 'postgresql://platform:platform@localhost:5432/platform'
})