const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const result = await query('SELECT * FROM users WHERE email = $1 AND is_active = true', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, fullName: user.full_name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    // Audit login
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, details, ip_address)
       VALUES ($1, 'login', 'user', $2, $3)`,
      [user.id, JSON.stringify({ email: user.email }), req.ip]
    ).catch(() => {});
    res.json({
      token,
      user: { id: user.id, email: user.email, role: user.role, fullName: user.full_name }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/me', authenticate, async (req, res) => {
  try {
    const result = await query(
      'SELECT id, email, role, full_name, phone, is_active, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/mosque-admins', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const result = await query(
      "SELECT id, full_name as fullname, email FROM users WHERE role = 'mosque_admin' AND is_active = true ORDER BY full_name"
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get mosque admins error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
