const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const result = await query(
      `SELECT m.*, u.full_name as admin_name, u.email as admin_email,
              (SELECT COUNT(*) FROM applications WHERE mosque_id = m.id) as total_applicants,
              (SELECT COUNT(*) FROM applications WHERE mosque_id = m.id AND status = 'approved') as approved_count,
              (SELECT COUNT(*) FROM basket_distributions WHERE mosque_id = m.id) as basket_count
       FROM mosques m
       LEFT JOIN users u ON u.id = m.admin_id
       WHERE m.is_active = true
       ORDER BY m.name`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get mosques error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', authenticate, authorize('super_admin'), async (req, res) => {
  const client = await require('../db').pool.connect();
  try {
    const { name, address, latitude, longitude, serviceAreaRadiusKm,
            adminName, adminEmail, adminPassword,
            adminId } = req.body;
    if (!name || !address) {
      return res.status(400).json({ error: 'Name and address are required' });
    }
    await client.query('BEGIN');

    // If admin creation fields are provided, create the user first
    let finalAdminId = adminId || null;
    if (adminName && adminEmail && adminPassword) {
      // Check if email already exists
      const existing = await client.query('SELECT id FROM users WHERE email = $1', [adminEmail]);
      if (existing.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'البريد الإلكتروني موجود مسبقاً' });
      }
      const passwordHash = await bcrypt.hash(adminPassword, 10);
      const newAdmin = await client.query(
        `INSERT INTO users (email, password_hash, role, full_name, is_active)
         VALUES ($1, $2, 'mosque_admin', $3, true) RETURNING id`,
        [adminEmail, passwordHash, adminName]
      );
      finalAdminId = newAdmin.rows[0].id;
    }

    const result = await client.query(
      `INSERT INTO mosques (name, address, latitude, longitude, service_area_radius_km, admin_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, address, latitude || null, longitude || null, serviceAreaRadiusKm || 5.0, finalAdminId]
    );
    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Create mosque error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

router.patch('/:id/admin', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const { adminId } = req.body;
    const result = await query(
      'UPDATE mosques SET admin_id = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [adminId || null, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Mosque not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Assign admin error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
