const fs = require('fs');
const path = require('path');
const pool = require('./db');

async function migrate() {
  console.log('🔄 Running database migration...');
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(sql);
    console.log('✅ Schema applied successfully!');
  } catch (err) {
    console.error('❌ Migration error:', err.message);
  } finally {
    pool.end();
  }
}

migrate();
