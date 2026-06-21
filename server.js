require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { pool } = require('./db');

const multer = require('multer');
const authRoutes = require('./routes/auth');
const applicantRoutes = require('./routes/applicants');
const applicationRoutes = require('./routes/applications');
const mosqueRoutes = require('./routes/mosques');
const dashboardRoutes = require('./routes/dashboard');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure uploads directory exists
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(uploadDir));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/applicants', applicantRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/mosques', mosqueRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Serve static frontend files
app.use(express.static(__dirname));

// API documentation endpoint
app.get('/api', (req, res) => {
  res.json({
    name: 'Ramadan Basket Management System API',
    version: '1.0.0',
    endpoints: [
      { path: '/api/auth/login', method: 'POST', auth: false },
      { path: '/api/auth/me', method: 'GET', auth: true },
      { path: '/api/applicants/register', method: 'POST', auth: false },
      { path: '/api/applicants/search', method: 'GET', auth: true, roles: ['super_admin', 'mosque_admin'] },
      { path: '/api/applicants/duplicates', method: 'GET', auth: true, roles: ['super_admin'] },
      { path: '/api/applications', method: 'GET', auth: true, roles: ['mosque_admin', 'super_admin'] },
      { path: '/api/applications/:id/status', method: 'PATCH', auth: true, roles: ['mosque_admin', 'super_admin'] },
      { path: '/api/applications/track/:nationalId', method: 'GET', auth: false },
      { path: '/api/mosques', method: 'GET', auth: false },
      { path: '/api/mosques', method: 'POST', auth: true, roles: ['super_admin'] },
      { path: '/api/mosques/:id/admin', method: 'PATCH', auth: true, roles: ['super_admin'] },
      { path: '/api/dashboard/stats', method: 'GET', auth: true, roles: ['super_admin', 'mosque_admin'] },
      { path: '/api/dashboard/reports/:type', method: 'GET', auth: true, roles: ['super_admin'] },
      { path: '/api/dashboard/audit', method: 'GET', auth: true, roles: ['super_admin'] },
    ]
  });
});

// Global error handler
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Auto-seed database on first run
async function autoSeed() {
  try {
    const { rows } = await pool.query(
      "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'users') as table_found"
    );
    if (!rows[0].table_found) {
      console.log('Schema not found — skipping auto-seed. Run database/schema.sql first.');
      return;
    }
    const count = await pool.query('SELECT COUNT(*)::int as count FROM users');
    if (count.rows[0].count > 0) {
      console.log('Database already seeded (' + count.rows[0].count + ' users)');
      return;
    }
    console.log('Seeding database with sample data...');
    const bcrypt = require('bcryptjs');
    const passwordHash = await bcrypt.hash('Admin@123', 10);

    await pool.query(
      `INSERT INTO users (email, password_hash, role, full_name, phone) VALUES
       ($1, $2, 'super_admin', 'المدير العام للنظام', '0555000000')
       ON CONFLICT (email) DO NOTHING`,
      ['admin@system.com', passwordHash]
    );
    await pool.query(
      `INSERT INTO users (email, password_hash, role, full_name, phone) VALUES
       ('mosque1@system.com', $1, 'mosque_admin', 'مسجد الفاروق', '0555000001'),
       ('mosque2@system.com', $1, 'mosque_admin', 'مسجد الرحمن', '0555000002'),
       ('mosque3@system.com', $1, 'mosque_admin', 'مسجد الملك سعود', '0555000003')
       ON CONFLICT (email) DO NOTHING`,
      [passwordHash]
    );
    const mosqueData = [
      { name: 'مسجد الفاروق', address: 'الرياض، حي النزهة', lat: 24.7136, lng: 46.6753 },
      { name: 'مسجد الرحمن', address: 'الرياض، حي العليا', lat: 24.7246, lng: 46.6653 },
      { name: 'مسجد الملك سعود', address: 'الرياض، حي الملز', lat: 24.6912, lng: 46.6854 },
    ];
    for (let i = 0; i < mosqueData.length; i++) {
      const m = mosqueData[i];
      const existing = await pool.query('SELECT id FROM mosques WHERE name = $1', [m.name]);
      if (existing.rows.length > 0) continue;
      await pool.query(
        `INSERT INTO mosques (name, address, latitude, longitude, admin_id)
         VALUES ($1, $2, $3, $4, (SELECT id FROM users WHERE email = $5))`,
        [m.name, m.address, m.lat, m.lng, 'mosque' + (i + 1) + '@system.com']
      );
    }
    // Create sample applicants with documents
    const applicantCount = await pool.query('SELECT COUNT(*)::int as count FROM applicants');
    if (applicantCount.rows[0].count === 0) {
      // Create sample document file
      const sampleDocPath = path.join(uploadDir, 'sample-doc.pdf');
      if (!fs.existsSync(sampleDocPath)) {
        const minimalPdf = Buffer.from(
          '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF'
        );
        fs.writeFileSync(sampleDocPath, minimalPdf);
      }

      const sampleApplicants = [
        { name: 'محمد أحمد السالم', nationalId: '1000000001', phone: '0555111111', address: 'الرياض، حي النزهة، شارع الأمير سلطان', familySize: 6 },
        { name: 'سارة عبدالله الناصر', nationalId: '1000000002', phone: '0555222222', address: 'الرياض، حي العليا، شارع التحلية', familySize: 4 },
        { name: 'خالد عمر الفهد', nationalId: '1000000003', phone: '0555333333', address: 'الرياض، حي الملز، شارع الستين', familySize: 8 },
      ];
      for (const a of sampleApplicants) {
        const userResult = await pool.query(
          `INSERT INTO users (email, password_hash, role, full_name, phone)
           VALUES ($1, $2, 'applicant', $3, $4)
           ON CONFLICT (email) DO NOTHING RETURNING id`,
          [`applicant_${a.nationalId}@system.com`, passwordHash, a.name, a.phone]
        );
        const userId = userResult.rows[0]?.id;
        if (!userId) continue;
        const applicantResult = await pool.query(
          `INSERT INTO applicants (full_name, national_id, phone, address, family_size, proof_document_path, user_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (national_id) DO NOTHING RETURNING id`,
          [a.name, a.nationalId, a.phone, a.address, a.familySize, '/uploads/sample-doc.pdf', userId]
        );
        const applicantId = applicantResult.rows[0]?.id;
        if (!applicantId) continue;
        // Assign to a mosque (round-robin)
        const mosqueRows = await pool.query('SELECT id FROM mosques ORDER BY name LIMIT 1 OFFSET 0');
        const sampleMosqueId = mosqueRows.rows[0]?.id;
        if (sampleMosqueId) {
          await pool.query(
            `INSERT INTO applications (applicant_id, mosque_id, status, created_at)
             VALUES ($1, $2, 'approved', NOW() - interval '2 days')
             ON CONFLICT (applicant_id, mosque_id) DO NOTHING`,
            [applicantId, sampleMosqueId]
          );
        }
      }
      // Create a duplicate attempt for demonstration
      try {
        const existingApplicant = await pool.query('SELECT id FROM applicants LIMIT 1');
        const secondMosque = await pool.query('SELECT id FROM mosques ORDER BY name LIMIT 1 OFFSET 1');
        if (existingApplicant.rows[0] && secondMosque.rows[0]) {
          await pool.query(
            `INSERT INTO duplicate_attempts (national_id, phone, full_name, attempted_mosque_id, existing_applicant_id, ip_address)
             VALUES ('1000000001', '0555111111', 'محمد أحمد السالم (محاولة مكررة)', $1, $2, '192.168.1.100')`,
            [secondMosque.rows[0].id, existingApplicant.rows[0].id]
          );
        }
      } catch (_) { /* non-critical */ }
    }
    console.log('Database seeded successfully — users, mosques, and sample applicants created');
    console.log('  Super Admin: admin@system.com / Admin@123');
    console.log('  Mosque Admin: mosque1@system.com / Admin@123');
    console.log('  Sample applicant IDs: 1000000001, 1000000002, 1000000003');
  } catch (err) {
    console.error('Auto-seed skipped:', err.message);
  }
}

// Start server
async function start() {
  try {
    await pool.query('SELECT NOW()');
    console.log('Database connected successfully');
    await autoSeed();
    app.listen(PORT, () => {
      console.log('Ramadan Basket Management System running on http://localhost:' + PORT);
      console.log('API docs at http://localhost:' + PORT + '/api');
    });
  } catch (err) {
    console.error('Failed to start server:', err.message);
    console.log('Starting in frontend-only mode...');
    app.listen(PORT, () => {
      console.log('Frontend server running on http://localhost:' + PORT);
    });
  }
}

start();
