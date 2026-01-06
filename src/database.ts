import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { addMinutes } from 'date-fns';
import { AppointmentStatus, Role } from './types';

const DEFAULT_DB_PATH = path.join(process.cwd(), 'data', 'dev.db');
const JWT_DEFAULT_SECRET = 'devsecret';

export const JWT_SECRET = process.env.JWT_SECRET || JWT_DEFAULT_SECRET;

function ensureDirectory(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const dbPath = process.env.DB_PATH || DEFAULT_DB_PATH;
ensureDirectory(dbPath);

export const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

export function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('ADMIN', 'PROFESSIONAL')),
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      instagram TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      duration_min INTEGER NOT NULL,
      price_base REAL,
      buffer_min INTEGER,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      service_id INTEGER NOT NULL REFERENCES services(id),
      professional_user_id INTEGER NOT NULL REFERENCES users(id),
      start_datetime TEXT NOT NULL,
      duration_min INTEGER NOT NULL,
      price_estimated REAL,
      deposit_amount REAL,
      status TEXT NOT NULL CHECK (status IN ('RESERVED','CONFIRMED','IN_PROCESS','FINALIZED','CANCELLED','NO_SHOW')),
      notes TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_appointments_professional_start ON appointments(professional_user_id, start_datetime);
    CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);
    CREATE INDEX IF NOT EXISTS idx_services_active ON services(active);
  `);

  seedDefaults();
}

function seedDefaults() {
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  if (userCount.count === 0) {
    const passwordHash = bcrypt.hashSync('password123', 10);
    const professionalPassword = bcrypt.hashSync('profesional123', 10);

    db.prepare(`
      INSERT INTO users (name, email, password_hash, role, active)
      VALUES (@name, @email, @password_hash, @role, 1)
    `).run({
      name: 'Brenda (Admin)',
      email: 'admin@salon.com',
      password_hash: passwordHash,
      role: 'ADMIN',
    });

    db.prepare(`
      INSERT INTO users (name, email, password_hash, role, active)
      VALUES (@name, @email, @password_hash, @role, 1)
    `).run({
      name: 'Brenda (Profesional)',
      email: 'brenda@salon.com',
      password_hash: professionalPassword,
      role: 'PROFESSIONAL',
    });
  }

  const serviceCount = db.prepare('SELECT COUNT(*) as count FROM services').get() as { count: number };
  if (serviceCount.count === 0) {
    const services = [
      { name: 'Balayage', duration_min: 480 },
      { name: 'Alisado', duration_min: 240 },
      { name: 'Nutrición', duration_min: 120 },
    ];

    const stmt = db.prepare(`
      INSERT INTO services (name, duration_min, active)
      VALUES (@name, @duration_min, 1)
    `);

    services.forEach((service) => stmt.run(service));
  }
}

export function isValidDate(value: string) {
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

export function toIso(value: string) {
  return new Date(value).toISOString();
}

export function calculateEnd(startIso: string, durationMin: number) {
  return addMinutes(new Date(startIso), durationMin).toISOString();
}

export function hasOverlap(options: {
  professionalId: number;
  startIso: string;
  durationMin: number;
  ignoreAppointmentId?: number;
}) {
  const { professionalId, startIso, durationMin, ignoreAppointmentId } = options;
  const endIso = calculateEnd(startIso, durationMin);

  const rows = db
    .prepare(
      `SELECT id, start_datetime, duration_min FROM appointments
       WHERE professional_user_id = @professionalId
         AND status NOT IN ('CANCELLED','NO_SHOW')
         ${ignoreAppointmentId ? 'AND id != @ignoreAppointmentId' : ''}
         AND start_datetime < @endIso
         AND datetime(start_datetime, '+' || duration_min || ' minutes') > @startIso`
    )
    .all({ professionalId, endIso, startIso, ignoreAppointmentId }) as Array<{
    id: number;
  }>;

  return rows.length > 0;
}

export function sanitizeUser<T extends { password_hash?: unknown }>(user: T): Omit<T, 'password_hash'> {
  const { password_hash, ...rest } = user;
  return rest;
}

export const allowedStatusTransitions: Record<AppointmentStatus, AppointmentStatus[]> = {
  RESERVED: ['CONFIRMED', 'CANCELLED', 'NO_SHOW'],
  CONFIRMED: ['IN_PROCESS', 'CANCELLED', 'NO_SHOW'],
  IN_PROCESS: ['FINALIZED', 'CANCELLED', 'NO_SHOW'],
  FINALIZED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export const allowedCreationStatuses: AppointmentStatus[] = ['RESERVED', 'CONFIRMED'];
export const defaultRoles: Role[] = ['ADMIN', 'PROFESSIONAL'];
