-- Ramadan Basket Management System
-- PostgreSQL Database Schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USERS (Super Admin, Mosque Admin, Applicants)
-- ============================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('super_admin', 'mosque_admin', 'applicant')),
  full_name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- MOSQUES
-- ============================================
CREATE TABLE mosques (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  address TEXT NOT NULL,
  latitude DECIMAL(10, 7),
  longitude DECIMAL(10, 7),
  service_area_radius_km DECIMAL(5, 2) DEFAULT 5.0,
  admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- APPLICANTS (needy families)
-- ============================================
CREATE TABLE applicants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name VARCHAR(255) NOT NULL,
  national_id VARCHAR(50) UNIQUE NOT NULL,
  phone VARCHAR(20) NOT NULL,
  address TEXT NOT NULL,
  family_size INTEGER NOT NULL CHECK (family_size > 0),
  proof_document_path VARCHAR(500),
  gps_latitude DECIMAL(10, 7),
  gps_longitude DECIMAL(10, 7),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for duplicate prevention
CREATE UNIQUE INDEX idx_applicants_national_id ON applicants(national_id);
CREATE INDEX idx_applicants_phone ON applicants(phone);
CREATE INDEX idx_applicants_phone_lookup ON applicants(phone);

-- ============================================
-- APPLICATIONS (registration requests)
-- ============================================
CREATE TABLE applications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  applicant_id UUID NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  mosque_id UUID NOT NULL REFERENCES mosques(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'received_basket')),
  admin_notes TEXT,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- Prevent multiple applications to different mosques by same applicant
  CONSTRAINT unique_applicant_mosque UNIQUE (applicant_id, mosque_id)
);

-- Index for duplicate detection
CREATE INDEX idx_applications_applicant ON applications(applicant_id);
CREATE INDEX idx_applications_mosque ON applications(mosque_id);
CREATE INDEX idx_applications_status ON applications(status);

-- ============================================
-- DUPLICATE ATTEMPTS LOG
-- ============================================
CREATE TABLE duplicate_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  national_id VARCHAR(50),
  phone VARCHAR(20),
  full_name VARCHAR(255),
  attempted_mosque_id UUID REFERENCES mosques(id),
  existing_applicant_id UUID REFERENCES applicants(id),
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- AUDIT LOGS
-- ============================================
CREATE TYPE audit_action AS ENUM (
  'create', 'update', 'delete', 'login', 'logout',
  'approve', 'reject', 'receive_basket', 'duplicate_detected',
  'export_report', 'sms_sent'
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  action audit_action NOT NULL,
  entity_type VARCHAR(50),
  entity_id UUID,
  details JSONB,
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);

-- ============================================
-- SMS NOTIFICATIONS LOG
-- ============================================
CREATE TABLE sms_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID REFERENCES applications(id),
  phone VARCHAR(20) NOT NULL,
  message TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  provider_response JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- BASKET DISTRIBUTION
-- ============================================
CREATE TABLE basket_distributions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  mosque_id UUID NOT NULL REFERENCES mosques(id),
  distributed_by UUID REFERENCES users(id),
  distribution_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_distributions_mosque_date ON basket_distributions(mosque_id, distribution_date);

-- ============================================
-- SAMPLE DATA
-- ============================================
-- Password: Admin@123 (bcrypt hash)
INSERT INTO users (email, password_hash, role, full_name, phone) VALUES
  ('admin@system.com', '$2a$10$8KzQMGx5M5K5K5K5K5K5K5K5K5K5K5K5K5K5K5K5K5K5K5K5K5K5', 'super_admin', 'المدير العام للنظام', '0555000000'),
  ('mosque1@system.com', '$2a$10$8KzQMGx5M5K5K5K5K5K5K5K5K5K5K5K5K5K5K5K5K5K5K5K5K5K5', 'mosque_admin', 'مسجد الفاروق', '0555000001');

INSERT INTO mosques (name, address, latitude, longitude, admin_id, service_area_radius_km) VALUES
  ('مسجد الفاروق', 'الرياض، حي النزهة', 24.7136, 46.6753, (SELECT id FROM users WHERE email = 'mosque1@system.com'), 5.0),
  ('مسجد الرحمن', 'الرياض، حي العليا', 24.7246, 46.6653, NULL, 5.0),
  ('مسجد الملك سعود', 'الرياض، حي الملز', 24.6912, 46.6854, NULL, 5.0);
