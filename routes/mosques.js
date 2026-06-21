const express = require('express');
const { query } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const result = await query(
      `SELECT m.*, u.full_name as admin_name,
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
  try {
    const { name, address, latitude, longitude, serviceAreaRadiusKm } = req.body;
    if (!name || !address) {
      return res.status(400).json({ error: 'Name and address are required' });
    }
    const result = await query(
      `INSERT INTO mosques (name, address, latitude, longitude, service_area_radius_km)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name, address, latitude || null, longitude || null, serviceAreaRadiusKm || 5.0]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create mosque error:', err);
    res.status(500).json({ error: 'Server error' });
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
