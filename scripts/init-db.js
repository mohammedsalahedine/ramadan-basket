/**
 * Database initialization script
 * Usage: node scripts/init-db.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function init() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const schema = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8');
    await pool.query(schema);
    console.log('Database schema created successfully');
  } catch (err) {
    console.error('Failed to initialize database:', err.message);
  } finally {
    await pool.end();
  }
}

init();
