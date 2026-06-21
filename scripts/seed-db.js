/**
 * Database seeding script
 * Usage: node scripts/seed-db.js
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function seed() {
  try {
    const passwordHash = await bcrypt.hash('Admin@123', 10);
    // Create super admin
    await pool.query(
      `INSERT INTO users (email, password_hash, role, full_name, phone)
       VALUES ($1, $2, 'super_admin', 'المدير العام للنظام', '0555000000')
       ON CONFLICT (email) DO NOTHING`,
      ['admin@system.com', passwordHash]
    );
    // Create mosque admins
    await pool.query(
      `INSERT INTO users (email, password_hash, role, full_name, phone)
       VALUES
         ('mosque1@system.com', $1, 'mosque_admin', 'مسجد الفاروق', '0555000001'),
         ('mosque2@system.com', $1, 'mosque_admin', 'مسجد الرحمن', '0555000002'),
         ('mosque3@system.com', $1, 'mosque_admin', 'مسجد الملك سعود', '0555000003')
       ON CONFLICT (email) DO NOTHING`,
      [passwordHash]
    );
    // Create mosques
    const mosques = [
      { name: 'مسجد الفاروق', address: 'الرياض، حي النزهة', lat: 24.7136, lng: 46.6753 },
      { name: 'مسجد الرحمن', address: 'الرياض، حي العليا', lat: 24.7246, lng: 46.6653 },
      { name: 'مسجد الملك سعود', address: 'الرياض، حي الملز', lat: 24.6912, lng: 46.6854 },
      { name: 'مسجد ابن عثيمين', address: 'الرياض، حي السليمانية', lat: 24.7035, lng: 46.6700 },
      { name: 'مسجد الحرمين', address: 'الرياض، حي الروضة', lat: 24.7340, lng: 46.6600 },
    ];
    for (let i = 0; i < mosques.length; i++) {
      const m = mosques[i];
      const existing = await pool.query('SELECT id FROM mosques WHERE name = $1', [m.name]);
      if (existing.rows.length > 0) continue;
      await pool.query(
        `INSERT INTO mosques (name, address, latitude, longitude, admin_id)
         VALUES ($1, $2, $3, $4,
           (SELECT id FROM users WHERE email = $5))`,
        [m.name, m.address, m.lat, m.lng, `mosque${i + 1}@system.com`]
      );
    }
    console.log('Sample data inserted successfully');
    console.log('');
    console.log('Default login credentials:');
    console.log('  Super Admin: admin@system.com / Admin@123');
    console.log('  Mosque Admin 1: mosque1@system.com / Admin@123');
  } catch (err) {
    console.error('Seed error:', err.message);
  } finally {
    await pool.end();
  }
}

seed();
