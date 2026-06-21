const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { query } = require('../db');
const { authenticate, authorize, audit } = require('../middleware/auth');

const storage = multer.diskStorage({
  destination: process.env.UPLOAD_DIR || './uploads',
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) return cb(null, true);
    cb(new Error('Only PDF, JPG, and PNG files are allowed'));
  }
});

router.post('/register', upload.single('proofDocument'), async (req, res) => {
  try {
    const { fullName, nationalId, phone, address, familySize, mosqueId, gpsLat, gpsLng } = req.body;
    if (!fullName || !nationalId || !phone || !address || !familySize || !mosqueId) {
      return res.status(400).json({ error: 'All required fields must be provided' });
    }
    // Check duplicate national ID
    const existingNationalId = await query('SELECT id FROM applicants WHERE national_id = $1', [nationalId]);
    if (existingNationalId.rows.length > 0) {
      const existing = await query(
        `SELECT a.id, a.full_name, m.name as mosque_name
         FROM applicants a
         JOIN applications app ON app.applicant_id = a.id
         JOIN mosques m ON m.id = app.mosque_id
         WHERE a.national_id = $1 LIMIT 1`,
        [nationalId]
      );
      // Log duplicate attempt
      await query(
        `INSERT INTO duplicate_attempts (national_id, phone, full_name, attempted_mosque_id, existing_applicant_id, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [nationalId, phone, fullName, mosqueId, existing.rows[0]?.id, req.ip]
      );
      return res.status(409).json({
        error: 'duplicate_detected',
        message: 'رقم الهوية مسجل مسبقاً في منصة أخرى',
        existingMosque: existing.rows[0]?.mosque_name
      });
    }
    // Check duplicate phone
    const existingPhone = await query('SELECT id FROM applicants WHERE phone = $1', [phone]);
    if (existingPhone.rows.length > 0) {
      return res.status(409).json({
        error: 'duplicate_phone',
        message: 'رقم الجوال مستخدم مسبقاً'
      });
    }
    // Verify mosque exists
    const mosqueCheck = await query('SELECT id FROM mosques WHERE id = $1', [mosqueId]);
    if (mosqueCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Mosque not found' });
    }
    // Create user account for applicant
    const passwordHash = await require('bcryptjs').hash(nationalId, 10); // Default password = national ID
    const userResult = await query(
      `INSERT INTO users (email, password_hash, role, full_name, phone)
       VALUES ($1, $2, 'applicant', $3, $4)
       RETURNING id`,
      [`applicant_${nationalId}@system.com`, passwordHash, fullName, phone]
    );
    const userId = userResult.rows[0].id;
    // Create applicant record
    const applicantResult = await query(
      `INSERT INTO applicants (full_name, national_id, phone, address, family_size, proof_document_path, gps_latitude, gps_longitude, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
       [fullName, nationalId, phone, address, familySize,
        req.file ? '/uploads/' + req.file.filename : null, gpsLat || null, gpsLng || null, userId]
    );
    const applicantId = applicantResult.rows[0].id;
    // Create application
    const appResult = await query(
      `INSERT INTO applications (applicant_id, mosque_id, status)
       VALUES ($1, $2, 'pending')
       RETURNING id`,
      [applicantId, mosqueId]
    );
    await query(
      `INSERT INTO audit_logs (action, entity_type, entity_id, details, ip_address)
       VALUES ('create', 'applicant', $1, $2, $3)`,
      [applicantId, JSON.stringify({ nationalId, mosqueId }), req.ip]
    );
    res.status(201).json({
      message: 'Registration successful',
      applicationId: appResult.rows[0].id,
      status: 'pending'
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'duplicate', message: 'This record already exists' });
    }
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/search', authenticate, authorize('super_admin', 'mosque_admin'), async (req, res) => {
  try {
    const { nationalId, phone, name } = req.query;
    let sql = `SELECT a.*, m.name as mosque_name, app.status, app.created_at as applied_date
               FROM applicants a
               JOIN applications app ON app.applicant_id = a.id
               JOIN mosques m ON m.id = app.mosque_id
               WHERE 1=1`;
    const params = [];
    if (nationalId) { params.push(nationalId); sql += ` AND a.national_id = $${params.length}`; }
    if (phone) { params.push(phone); sql += ` AND a.phone = $${params.length}`; }
    if (name) { params.push(`%${name}%`); sql += ` AND a.full_name ILIKE $${params.length}`; }
    sql += ' ORDER BY app.created_at DESC LIMIT 50';
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/duplicates', authenticate, authorize('super_admin'), async (req, res) => {
  try {
    const result = await query(
      `SELECT d.*, m1.name as attempted_mosque_name, m2.name as existing_mosque_name,
              a.full_name as applicant_name
       FROM duplicate_attempts d
       LEFT JOIN mosques m1 ON m1.id = d.attempted_mosque_id
       LEFT JOIN applicants a ON a.id = d.existing_applicant_id
       LEFT JOIN applications app ON app.applicant_id = a.id
       LEFT JOIN mosques m2 ON m2.id = app.mosque_id
       ORDER BY d.created_at DESC LIMIT 100`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Duplicates error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Accept token via query param for links opened in new tabs
const docAuth = (req, res, next) => {
  const token = req.query.token || req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const jwt = require('jsonwebtoken');
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    if (!['mosque_admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  } catch { return res.status(401).json({ error: 'Invalid token' }); }
};

// Serve applicant document file
router.get('/:id/document', docAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query('SELECT proof_document_path FROM applicants WHERE id = $1', [id]);
    if (result.rows.length === 0 || !result.rows[0].proof_document_path) {
      return res.status(404).json({ error: 'No document found' });
    }
    const relPath = result.rows[0].proof_document_path;
    const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
    const filename = path.basename(relPath);
    const filePath = path.join(uploadDir, filename);

    let finalPath = filePath;
    if (!fs.existsSync(finalPath)) {
      const extless = path.join(uploadDir, path.parse(filename).name);
      if (fs.existsSync(extless)) finalPath = extless;
      else return res.status(404).json({ error: 'File not found on disk. Uploads are cleared after server restart — files must be re-uploaded.' });
    }
    res.sendFile(finalPath);
  } catch (err) {
    console.error('Serve document error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
