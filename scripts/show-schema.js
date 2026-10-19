// Prints every table in the database with its columns.
// Usage: npm run schema
require('dotenv').config({ quiet: true });
const db = require('../config/database');

(async () => {
  try {
    const { rows } = await db.query(`
      SELECT c.table_name, c.column_name, c.data_type, c.is_nullable, c.column_default
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
      ORDER BY c.table_name, c.ordinal_position
    `);
    let current = null;
    for (const r of rows) {
      if (r.table_name !== current) {
        current = r.table_name;
        console.log(`\n📋 ${current}`);
      }
      const nullable = r.is_nullable === 'NO' ? ' NOT NULL' : '';
      const def = r.column_default ? ` DEFAULT ${r.column_default}` : '';
      console.log(`   - ${r.column_name}: ${r.data_type}${nullable}${def}`);
    }
    const fks = await db.query(`
      SELECT tc.table_name, kcu.column_name, ccu.table_name AS ref_table, ccu.column_name AS ref_column
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
    `);
    console.log('\n🔗 Relationships');
    for (const f of fks.rows) console.log(`   - ${f.table_name}.${f.column_name} → ${f.ref_table}.${f.ref_column}`);
    console.log('');
  } catch (err) {
    console.error('❌', err.message);
  } finally {
    await db.end();
  }
})();
