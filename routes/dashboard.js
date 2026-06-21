const express = require('express');
const { query } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/stats', authenticate, authorize('super_admin', 'mosque_admin'), async (req, res) => {
  try {
    let mosqueFilter = '';
    const params = [];
    if (req.user.role === 'mosque_admin') {
      params.push(req.user.id);
      mosqueFilter = ` WHERE m.admin_id = $${params.length}`;
    }
    const stats = await query(
      `SELECT
        COUNT(DISTINCT a.id)::int as total_applicants,
        COUNT(DISTINCT CASE WHEN app.status IN ('approved', 'received_basket') THEN a.id END)::int as approved_count,
        COUNT(DISTINCT CASE WHEN app.status = 'received_basket' THEN a.id END)::int as baskets_distributed,
        COUNT(DISTINCT CASE WHEN app.status = 'pending' THEN a.id END)::int as pending_count
      FROM applications app
      JOIN applicants a ON a.id = app.applicant_id
      JOIN mosques m ON m.id = app.mosque_id${mosqueFilter}`,
      params
    );
    // Mosque count
    const mosqueCount = await query(
      `SELECT COUNT(*)::int as count FROM mosques WHERE is_active = true${
        req.user.role === 'mosque_admin' ? ` AND admin_id = $1` : ''
      }`,
      req.user.role === 'mosque_admin' ? [req.user.id] : []
    );
    const duplicateCount = await query(
      'SELECT COUNT(*)::int as count FROM duplicate_attempts'
    );
    res.json({
      ...stats.rows[0],
      mosqueCount: mosqueCount.rows[0].count,
      duplicateCount: duplicateCount.rows[0].count,
    });
  } catch (err) {
    console.error('Dashboard stats error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/reports/:type', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const { type } = req.params;
    if (type === 'distribution') {
      const result = await query(
        `SELECT m.name as mosque_name, COUNT(bd.id)::int as baskets_distributed,
                COUNT(DISTINCT a.id)::int as total_applicants
         FROM mosques m
         LEFT JOIN applications app ON app.mosque_id = m.id AND app.status = 'received_basket'
         LEFT JOIN basket_distributions bd ON bd.mosque_id = m.id
         LEFT JOIN applicants a ON a.id = app.applicant_id
         GROUP BY m.id, m.name ORDER BY m.name`
      );
      return res.json(result.rows);
    }
    if (type === 'duplicates') {
      const result = await query(
        `SELECT d.*, m1.name as attempted_mosque, m2.name as existing_mosque,
                a.full_name as applicant_name
         FROM duplicate_attempts d
         LEFT JOIN mosques m1 ON m1.id = d.attempted_mosque_id
         LEFT JOIN applicants a ON a.id = d.existing_applicant_id
         LEFT JOIN applications app ON app.applicant_id = a.id
         LEFT JOIN mosques m2 ON m2.id = app.mosque_id
         ORDER BY d.created_at DESC`
      );
      return res.json(result.rows);
    }
    if (type === 'families') {
      const result = await query(
        `SELECT a.full_name, a.national_id, a.phone, a.family_size, a.address,
                app.status, m.name as mosque_name, app.created_at
         FROM applicants a
         JOIN applications app ON app.applicant_id = a.id
         JOIN mosques m ON m.id = app.mosque_id
         ORDER BY app.created_at DESC`
      );
      return res.json(result.rows);
    }
    res.status(400).json({ error: 'Invalid report type' });
  } catch (err) {
    console.error('Report error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/audit', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const result = await query(
      `SELECT al.*, u.full_name as user_name
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       ORDER BY al.created_at DESC LIMIT 200`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Audit log error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
