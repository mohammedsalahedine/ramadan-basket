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

// Start server
async function start() {
  try {
    // Test database connection
    await pool.query('SELECT NOW()');
    console.log('Database connected successfully');
    app.listen(PORT, () => {
      console.log(`Ramadan Basket Management System running on http://localhost:${PORT}`);
      console.log(`API docs at http://localhost:${PORT}/api`);
    });
  } catch (err) {
    console.error('Failed to start server:', err.message);
    console.log('Starting in frontend-only mode...');
    app.listen(PORT, () => {
      console.log(`Frontend server running on http://localhost:${PORT}`);
    });
  }
}

start();
