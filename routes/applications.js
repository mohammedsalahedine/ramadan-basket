const express = require('express');
const { query } = require('../db');
const { authenticate, authorize, audit } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, authorize('mosque_admin', 'super_admin'), async (req, res) => {
  try {
    let sql = `SELECT app.*, a.full_name, a.national_id, a.phone, a.family_size, a.address,
                       a.proof_document_path, m.name as mosque_name
                FROM applications app
                JOIN applicants a ON a.id = app.applicant_id
                JOIN mosques m ON m.id = app.mosque_id`;
    const params = [];
    // Mosque admin sees only their mosque
    if (req.user.role === 'mosque_admin') {
      params.push(req.user.id);
      sql += ` WHERE m.admin_id = $${params.length}`;
    }
    const { status } = req.query;
    if (status) {
      params.push(status);
      sql += params.length === 1 ? ' WHERE' : ' AND';
      sql += ` app.status = $${params.length}`;
    }
    sql += ' ORDER BY app.created_at DESC LIMIT 100';
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Get applications error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/:id/status', authenticate, authorize('mosque_admin', 'super_admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    const validStatuses = ['approved', 'rejected', 'received_basket'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` });
    }
    const app = await query('SELECT * FROM applications WHERE id = $1', [id]);
    if (app.rows.length === 0) {
      return res.status(404).json({ error: 'Application not found' });
    }
    // Check mosque admin owns this application
    if (req.user.role === 'mosque_admin') {
      const ownership = await query(
        'SELECT id FROM applications WHERE id = $1 AND mosque_id IN (SELECT id FROM mosques WHERE admin_id = $2)',
        [id, req.user.id]
      );
      if (ownership.rows.length === 0) {
        return res.status(403).json({ error: 'Not authorized for this application' });
      }
    }
    const result = await query(
      `UPDATE applications SET status = $1, admin_notes = $2, reviewed_by = $3, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [status, notes || null, req.user.id, id]
    );
    // If marking as received_basket, create distribution record
    if (status === 'received_basket') {
      await query(
        `INSERT INTO basket_distributions (application_id, mosque_id, distributed_by)
         SELECT $1, mosque_id, $2 FROM applications WHERE id = $1`,
        [id, req.user.id]
      );
    }
    // Audit
    const actionMap = { approved: 'approve', rejected: 'reject', received_basket: 'receive_basket' };
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, ip_address)
       VALUES ($1, $2, 'application', $3, $4, $5)`,
      [req.user.id, actionMap[status], id, JSON.stringify({ status, notes }), req.ip]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update application error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/track/:nationalId', async (req, res) => {
  try {
    const { nationalId } = req.params;
    const result = await query(
      `SELECT app.status, app.created_at as applied_date, app.reviewed_at, app.admin_notes,
              a.full_name, a.family_size, m.name as mosque_name,
              bd.distribution_date
       FROM applicants a
       JOIN applications app ON app.applicant_id = a.id
       JOIN mosques m ON m.id = app.mosque_id
       LEFT JOIN basket_distributions bd ON bd.application_id = app.id
       WHERE a.national_id = $1
       ORDER BY app.created_at DESC`,
      [nationalId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No applications found for this National ID' });
    }
    res.json(result.rows);
  } catch (err) {
    console.error('Track error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
