# نظام إدارة سلال رمضان (Ramadan Basket Management System)

A fair distribution platform that prevents duplicate registrations across multiple mosques. Built with React + Tailwind CSS frontend, Node.js/Express backend, and PostgreSQL.

## Features

- **Multi-role system**: Super Admin, Mosque Admin, Applicant
- **Duplicate prevention**: National ID and phone uniqueness enforced across all mosques
- **Approval workflow**: Pending → Approved/Rejected → Received Basket
- **Mosque management**: Each mosque with service area and admin assignment
- **Dashboard**: Real-time stats, applicant lists, and approval actions
- **Search**: Find families by National ID across all mosques
- **Reports**: Distribution, duplicate attempts, family lists (Excel/PDF)
- **SMS notifications**: Automatic status updates via Twilio
- **Arabic RTL**: Full Arabic interface
- **Dark mode**: Toggle between light and dark themes
- **Responsive**: Works on mobile and desktop

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Tailwind CSS 3, Babel Standalone |
| Backend | Node.js, Express 4 |
| Database | PostgreSQL 15+ |
| Auth | JWT (jsonwebtoken + bcryptjs) |
| File Upload | Multer |
| Reports | xlsx (Excel), pdfkit (PDF) |
| SMS | Twilio |

## Quick Start

### 1. Prerequisites

- Node.js 18+
- PostgreSQL 15+
- npm or yarn

### 2. Setup

```bash
# Clone the repository
git clone <repo-url>
cd ramadan-basket-management

# Install dependencies
npm install

# Create environment file
cp .env.example .env
# Edit .env with your PostgreSQL connection string

# Create the database
createdb ramadan_baskets

# Initialize schema and seed data
npm run db:init
npm run db:seed

# Start the server
npm start
```

### 3. Access

Open http://localhost:3000 in your browser.

### Default Login Credentials

| Role | Email | Password |
|---|---|---|
| Super Admin | admin@system.com | Admin@123 |
| Mosque Admin 1 | mosque1@system.com | Admin@123 |
| Mosque Admin 2 | mosque2@system.com | Admin@123 |

## Frontend Pages

| Page | File | Description |
|---|---|---|
| Login | `index.html` | Multi-role login page with dark mode |
| Registration | `register.html` | 3-step applicant registration form |
| Status Tracking | `status.html` | Check application status by National ID |
| Mosque Dashboard | `mosque-admin.html` | Manage applicants for one mosque |
| Super Admin Dashboard | `super-admin.html` | System-wide management and reports |

## API Endpoints

### Authentication
- `POST /api/auth/login` — Login with email and password
- `GET /api/auth/me` — Get current user info (auth required)

### Applicants
- `POST /api/applicants/register` — Register a new applicant
- `GET /api/applicants/search?nationalId=&phone=&name=` — Search applicants (admin)
- `GET /api/applicants/duplicates` — Get duplicate attempt logs (super admin)

### Applications
- `GET /api/applications?status=` — List applications (admin)
- `PATCH /api/applications/:id/status` — Update application status
- `GET /api/applications/track/:nationalId` — Track by National ID (public)

### Mosques
- `GET /api/mosques` — List all mosques (public)
- `POST /api/mosques` — Create a mosque (super admin)
- `PATCH /api/mosques/:id/admin` — Assign mosque admin (super admin)

### Dashboard
- `GET /api/dashboard/stats` — System statistics
- `GET /api/dashboard/reports/:type` — Export reports (distribution, duplicates, families)
- `GET /api/dashboard/audit` — Audit log

## Database Schema

See `database/schema.sql` for the complete PostgreSQL schema including:
- `users` — All user accounts with role-based access
- `mosques` — Mosque information and service areas
- `applicants` — Registered families with unique constraints
- `applications` — Application requests with approval workflow
- `duplicate_attempts` — Log of blocked duplicate registrations
- `audit_logs` — Complete audit trail for all actions
- `basket_distributions` — Distribution records
- `sms_log` — SMS notification history

## Project Structure

```
├── server.js           # Express app entry point
├── db.js               # PostgreSQL connection pool
├── package.json
├── .env.example
├── index.html          # Login page (entry point)
├── register.html       # Applicant registration
├── status.html         # Status tracking
├── mosque-admin.html   # Mosque admin dashboard
├── super-admin.html    # Super admin dashboard
├── routes/
│   ├── auth.js         # Authentication routes
│   ├── applicants.js   # Applicant management
│   ├── applications.js # Application workflow
│   ├── mosques.js      # Mosque management
│   └── dashboard.js    # Dashboard and reports
├── middleware/
│   └── auth.js         # JWT auth + authorization
├── database/
│   └── schema.sql      # PostgreSQL schema
├── scripts/
│   ├── init-db.js      # Database initialization
│   └── seed-db.js      # Sample data seeding
└── uploads/            # Document uploads
```

## Deployment — نشر التطبيق

### البنية المستهدفة

```
[المستخدم] → Render.com (Node.js + Express)
                        ↓
              Neon.tech (PostgreSQL)
```

- **Render**: يستضيف تطبيق Node.js (مجاناً، 750 ساعة/شهر)
- **Neon**: يستضيف قاعدة PostgreSQL (مجاناً، 10GB تخزين، بدون حد زمني)

---

### الخطوة 1: إنشاء قاعدة بيانات على Neon.tech

1. افتح [neon.tech](https://neon.tech) وسجّل الدخول (GitHub أو Google).
2. اضغط **Create a project**:
   - **Name**: `ramadan-baskets`
   - **Region**: اختر **US East** (الأقرب لـ Render المجاني)
3. بعد الإنشاء، ستظهر نافذة تحتوي على **Connection string** — انسخ الرابط:
   ```
   postgresql://user:password@ep-snowy-xxxx.us-east-2.aws.neon.tech/ramadan-baskets?sslmode=require
   ```
4. اذهب إلى **SQL Editor** في لوحة Neon، والصق محتوى ملف `database/schema.sql` وشغّله.

---

### الخطوة 2: رفع الكود إلى GitHub

```bash
# في مجلد المشروع
git init
git add .
git commit -m "ramadan basket management system"
# أنشئ مستودعاً على GitHub واربطه
git remote add origin https://github.com/your-username/ramadan-basket.git
git push -u origin main
```

---

### الخطوة 3: نشر الباك إند على Render.com

#### الطريقة A — تلقائية (Render Blueprint)

1. افتح [render.com](https://render.com) وسجّل الدخول (GitHub).
2. اضغط **New → Blueprint**.
3. اختر مستودع GitHub `ramadan-basket`.
4. Render سيقرأ ملف `render.yaml` تلقائياً وينشئ:
   - **Web Service** باسم `ramadan-basket-api`
   - **PostgreSQL** باسم `ramadan-basket-db` (اختياري، لكننا سنستخدم Neon بدلاً منه)
5. قبل الـ Deploy، عدّل **Environment Variables**:
   - استبدل `DATABASE_URL` برابط الاتصال من Neon (من الخطوة 1)
   - تأكد أن `NODE_ENV` = `production`
6. اضغط **Apply** → انتظر 3–5 دقائق.

#### الطريقة B — يدوية (أنصح بها مع Neon)

1. افتح [render.com](https://render.com) ← **New +** ← **Web Service**.
2. اختر مستودع GitHub.
3. الإعدادات:
   - **Name**: `ramadan-basket-api`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Plan**: **Free**
4. أضف المتغيرات البيئية (Environment Variables):
   ```
   NODE_ENV = production
   DATABASE_URL = postgresql://user:password@ep-xxxx.neon.tech/ramadan-baskets?sslmode=require
   JWT_SECRET = (اضغط "Generate" أو اكتب مفتاحاً عشوائياً)
   JWT_EXPIRES_IN = 7d
   ```
5. اضغط **Create Web Service**.
6. انتظر حتى يظهر `Deploy Live` (3–5 دقائق).

---

### الخطوة 4: تهيئة قاعدة البيانات (مرة واحدة فقط)

بعد نجاح أول deploy، افتح **Render Shell** أو استخدم **Neon SQL Editor** لتشغيل seeds:

#### عبر Render Shell:
1. في لوحة Render، افتح Web Service ← **Shell**.
2. شغّل:
   ```bash
   node scripts/seed-db.js
   ```

#### عبر Neon SQL Editor (الأسهل):
1. اذهب إلى Neon Dashboard ← **SQL Editor**.
2. الصق وأدرج ملف `database/schema.sql` (إذا لم تكن فعلت).
3. ثم أدرج بيانات المستخدمين يدوياً (أو شغّل `scripts/seed-db.js` محلياً وارفع البيانات).

---

### الخطوة 5: ربط النطاق (اختياري)

Render يعطيك رابطاً مثل `https://ramadan-basket-api.onrender.com`. هذا الرابط هو عنوان التطبيق النهائي.

---

### ملفات الإعداد المضافة حديثاً

| الملف | الغرض |
|---|---|
| `Procfile` | يخبر Render بكيفية تشغيل التطبيق (`node server.js`) |
| `render.yaml` | Blueprint للتكوين التلقائي (اختياري) |
| `.gitignore` | يمنع رفع `node_modules/` و `.env` و `uploads/` |
| `uploads/.gitkeep` | يحافظ على مجلد رفع الملفات في المستودع فارغاً |

### تنبيهات مهمة

- **⚠️ ملفات الرفع**: Render لا يحتفظ بالملفات المرفوعة (`uploads/`) بعد إعادة التشغيل. لاستمرارية رفع الملفات، استخدم خدمة تخزين سحابي (مثل Cloudinary أو AWS S3) في الإنتاج الفعلي.
- **🔑 JWT_SECRET**: في `render.yaml` استخدمت `generateValue: true` — Render سيُنشئ مفتاحاً عشوائياً آمناً تلقائياً.
- **📦 قاعدة البيانات**: بيانات `seed` تُضاف **مرة واحدة فقط** بعد أول نشر. إذا أعدت النشر على قاعدة جديدة، أعد تشغيل seed.
- **⏱️ خطة Render Free**: تنام الخدمة بعد 15 دقيقة من عدم الاستخدام. أول زيارة بعد النوم تأخذ 30–60 ثانية إضافية حتى تستيقظ.

### المستخدمون الافتراضيون بعد الـ Seed

| الدور | البريد الإلكتروني | كلمة المرور |
|---|---|---|
| مدير عام | admin@system.com | Admin@123 |
| مشرف مسجد الفاروق | mosque1@system.com | Admin@123 |
| مشرف مسجد الرحمن | mosque2@system.com | Admin@123 |
| مشرف مسجد الملك سعود | mosque3@system.com | Admin@123 |

---

## Security

- Passwords hashed with bcryptjs (10 rounds)
- JWT authentication with configurable expiry
- Role-based access control (RBAC)
- Input validation on all endpoints
- Audit logging for all state-changing actions
- SQL injection prevention via parameterized queries
- File upload restrictions (type and size limits)
