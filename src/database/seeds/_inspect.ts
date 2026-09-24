import { pool } from '../pool.ts';

const r = await pool.query(
  `SELECT column_name, data_type, is_nullable, column_default
   FROM information_schema.columns
   WHERE table_name = 'listings'
   ORDER BY ordinal_position`,
);
for (const c of r.rows) {
  console.log(`${c.column_name} | ${c.data_type} | nullable=${c.is_nullable} | default=${c.column_default}`);
}

const idx = await pool.query(
  `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'listings' ORDER BY indexname`,
);
console.log('--- indexes ---');
for (const i of idx.rows) console.log(`${i.indexname} => ${i.indexdef}`);

await pool.end();
