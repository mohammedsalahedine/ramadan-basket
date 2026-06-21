const express = require('express');
const { query } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const XLSX = require('xlsx');

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
    const rows = await getReportData(req.params.type);
    res.json(rows);
  } catch (err) {
    console.error('Report error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

async function getReportData(type) {
  if (type === 'distribution') {
    return (await query(
      `SELECT m.name as mosque_name, COUNT(bd.id)::int as baskets_distributed,
               COUNT(DISTINCT a.id)::int as total_applicants
        FROM mosques m
        LEFT JOIN applications app ON app.mosque_id = m.id AND app.status = 'received_basket'
        LEFT JOIN basket_distributions bd ON bd.mosque_id = m.id
        LEFT JOIN applicants a ON a.id = app.applicant_id
        GROUP BY m.id, m.name ORDER BY m.name`
    )).rows;
  }
  if (type === 'duplicates') {
    return (await query(
      `SELECT d.*, m1.name as attempted_mosque, m2.name as existing_mosque,
               a.full_name as applicant_name
        FROM duplicate_attempts d
        LEFT JOIN mosques m1 ON m1.id = d.attempted_mosque_id
        LEFT JOIN applicants a ON a.id = d.existing_applicant_id
        LEFT JOIN applications app ON app.applicant_id = a.id
        LEFT JOIN mosques m2 ON m2.id = app.mosque_id
        ORDER BY d.created_at DESC`
    )).rows;
  }
  if (type === 'families') {
    return (await query(
      `SELECT a.full_name, a.national_id, a.phone, a.family_size, a.address,
               app.status, m.name as mosque_name, app.created_at
        FROM applicants a
        JOIN applications app ON app.applicant_id = a.id
        JOIN mosques m ON m.id = app.mosque_id
        ORDER BY app.created_at DESC`
    )).rows;
  }
  throw new Error('Invalid report type');
}

// Accept token via query param for download links (no custom headers possible)
const downloadAuth = (req, res, next) => {
  const token = req.query.token || req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const jwt = require('jsonwebtoken');
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    if (req.user.role !== 'super_admin') return res.status(403).json({ error: 'Forbidden' });
    next();
  } catch { return res.status(401).json({ error: 'Invalid token' }); }
};

router.get('/reports/:type/download', downloadAuth, async (req, res) => {
  try {
    const { type } = req.params;
    const format = req.query.format || 'xlsx';
    const rows = await getReportData(type);
    const titles = { distribution: 'تقرير التوزيع', duplicates: 'تقرير المكررين', families: 'تقرير العائلات' };
    const title = titles[type] || type;

    if (format === 'xlsx') {
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, title);
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${title}.xlsx"`);
      return res.send(buf);
    }

    if (format === 'html') {
      const tableRows = rows.map(r => `<tr>${Object.values(r).map(v => `<td>${v ?? '—'}</td>`).join('')}</tr>`).join('');
      const headers = Object.keys(rows[0] || {}).map(h => `<th>${h}</th>`).join('');
      res.send(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>${title}</title><style>
        body { font-family: system-ui; padding: 20px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #ccc; padding: 8px; text-align: right; font-size: 14px; }
        th { background: #f5f5f5; }
        @media print { body { padding: 0; } }
      </style></head><body><h2>${title}</h2><table><thead><tr>${headers}</tr></thead><tbody>${tableRows}</tbody></table>
      <script>window.print()</script></body></html>`);
      return;
    }

    res.status(400).json({ error: 'Invalid format' });
  } catch (err) {
    console.error('Download error:', err);
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
