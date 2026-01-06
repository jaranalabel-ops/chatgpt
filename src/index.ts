import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import {
  db,
  initializeDatabase,
  isValidDate,
  toIso,
  hasOverlap,
  sanitizeUser,
  allowedStatusTransitions,
  allowedCreationStatuses,
} from './database';
import { authMiddleware, getCurrentUser, issueToken } from './auth';
import {
  appointmentCreateSchema,
  appointmentStatusEnum,
  appointmentStatusSchema,
  appointmentUpdateSchema,
  availabilityQuerySchema,
  clientSchema,
  loginSchema,
  professionalSchema,
  serviceSchema,
  statusUpdateSchema,
  updateClientSchema,
  updateServiceSchema,
} from './validators';
import { AppointmentStatus, User, Client, Service, Appointment } from './types';

dotenv.config();
initializeDatabase();

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

app.post('/auth/login', (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  }

  const { email, password } = parsed.data;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as User | undefined;
  if (!user || user.active !== 1) {
    return res.status(401).json({ message: 'Usuario o contraseña incorrectos' });
  }

  const isValidPassword = bcrypt.compareSync(password, user.password_hash);
  if (!isValidPassword) {
    return res.status(401).json({ message: 'Usuario o contraseña incorrectos' });
  }

  const token = issueToken({ sub: user.id, role: user.role });
  return res.json({ token, user: sanitizeUser(user) });
});

app.get('/me', authMiddleware, (req, res) => {
  const user = getCurrentUser(req);
  if (!user) {
    return res.status(404).json({ message: 'Usuario no encontrado' });
  }
  return res.json(user);
});

// Clients
app.get('/clients', authMiddleware, (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  let rows;
  if (search) {
    rows = db
      .prepare(
        `SELECT * FROM clients WHERE name LIKE @like OR phone LIKE @like ORDER BY name ASC`
      )
      .all({ like: `%${search}%` });
  } else {
    rows = db.prepare('SELECT * FROM clients ORDER BY created_at DESC').all();
  }
  return res.json(rows);
});

app.post('/clients', authMiddleware, (req, res) => {
  const parsed = clientSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  }

  const { name, phone, instagram, notes } = parsed.data;

  const existing = db.prepare('SELECT id FROM clients WHERE phone = ?').get(phone);
  if (existing) {
    return res.status(409).json({ message: 'El teléfono ya está registrado' });
  }

  const result = db
    .prepare(
      `INSERT INTO clients (name, phone, instagram, notes) VALUES (@name, @phone, @instagram, @notes)`
    )
    .run({ name, phone, instagram: instagram ?? null, notes: notes ?? null });

  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(result.lastInsertRowid);
  return res.status(201).json(client);
});

app.patch('/clients/:id', authMiddleware, (req, res) => {
  const clientId = Number(req.params.id);
  if (Number.isNaN(clientId)) {
    return res.status(400).json({ message: 'ID inválido' });
  }

  const parsed = updateClientSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  }

  const existing = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId) as Client | undefined;
  if (!existing) {
    return res.status(404).json({ message: 'Cliente no encontrado' });
  }

  if (parsed.data.phone && parsed.data.phone !== existing.phone) {
    const duplicate = db.prepare('SELECT id FROM clients WHERE phone = ?').get(parsed.data.phone);
    if (duplicate) {
      return res.status(409).json({ message: 'El teléfono ya está registrado' });
    }
  }

  db.prepare(
    `UPDATE clients
     SET name = COALESCE(@name, name),
         phone = COALESCE(@phone, phone),
         instagram = COALESCE(@instagram, instagram),
         notes = COALESCE(@notes, notes),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = @id`
  ).run({ id: clientId, ...parsed.data });

  const updated = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);
  return res.json(updated);
});

// Services
app.get('/services', authMiddleware, (req, res) => {
  const includeInactive = req.query.includeInactive === 'true';
  const rows = db
    .prepare(
      `SELECT * FROM services WHERE (@includeInactive = 1 OR active = 1) ORDER BY name ASC`
    )
    .all({ includeInactive: includeInactive ? 1 : 0 });
  return res.json(rows);
});

app.post('/services', authMiddleware, (req, res) => {
  const parsed = serviceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  }

  const { name, duration_min, price_base, buffer_min, active } = parsed.data;
  const result = db
    .prepare(
      `INSERT INTO services (name, duration_min, price_base, buffer_min, active)
       VALUES (@name, @duration_min, @price_base, @buffer_min, @active)`
    )
    .run({
      name,
      duration_min,
      price_base: price_base ?? null,
      buffer_min: buffer_min ?? null,
      active: active === false ? 0 : 1,
    });

  const service = db.prepare('SELECT * FROM services WHERE id = ?').get(result.lastInsertRowid);
  return res.status(201).json(service);
});

app.put('/services/:id', authMiddleware, (req, res) => {
  const serviceId = Number(req.params.id);
  if (Number.isNaN(serviceId)) {
    return res.status(400).json({ message: 'ID inválido' });
  }

  const parsed = updateServiceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  }

  const existing = db.prepare('SELECT * FROM services WHERE id = ?').get(serviceId) as Service | undefined;
  if (!existing) {
    return res.status(404).json({ message: 'Servicio no encontrado' });
  }

  db.prepare(
    `UPDATE services
     SET name = COALESCE(@name, name),
         duration_min = COALESCE(@duration_min, duration_min),
         price_base = COALESCE(@price_base, price_base),
         buffer_min = COALESCE(@buffer_min, buffer_min),
         active = COALESCE(@activeFlag, active),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = @id`
  ).run({
    id: serviceId,
    name: parsed.data.name,
    duration_min: parsed.data.duration_min,
    price_base: parsed.data.price_base,
    buffer_min: parsed.data.buffer_min,
    activeFlag:
      typeof parsed.data.active === 'boolean' ? (parsed.data.active ? 1 : 0) : undefined,
  });

  const updated = db.prepare('SELECT * FROM services WHERE id = ?').get(serviceId);
  return res.json(updated);
});

app.patch('/services/:id/status', authMiddleware, (req, res) => {
  const serviceId = Number(req.params.id);
  const parsed = statusUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  }

  const existing = db.prepare('SELECT * FROM services WHERE id = ?').get(serviceId);
  if (!existing) {
    return res.status(404).json({ message: 'Servicio no encontrado' });
  }

  db.prepare('UPDATE services SET active = @active, updated_at = CURRENT_TIMESTAMP WHERE id = @id').run({
    id: serviceId,
    active: parsed.data.active ? 1 : 0,
  });

  const updated = db.prepare('SELECT * FROM services WHERE id = ?').get(serviceId);
  return res.json(updated);
});

// Professionals
app.get('/professionals', authMiddleware, (req, res) => {
  const includeInactive = req.query.includeInactive === 'true';
  const rows = db
    .prepare(
      `SELECT id, name, email, role, active, created_at, updated_at
       FROM users
       WHERE role = 'PROFESSIONAL' AND (@includeInactive = 1 OR active = 1)
       ORDER BY name ASC`
    )
    .all({ includeInactive: includeInactive ? 1 : 0 });
  return res.json(rows);
});

app.post('/professionals', authMiddleware, (req, res) => {
  const parsed = professionalSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  }

  const { name, email, password, role, active } = parsed.data;

  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (exists) {
    return res.status(409).json({ message: 'El email ya está registrado' });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const result = db
    .prepare(
      `INSERT INTO users (name, email, password_hash, role, active)
       VALUES (@name, @email, @password_hash, @role, @active)`
    )
    .run({
      name,
      email,
      password_hash: passwordHash,
      role,
      active: active === false ? 0 : 1,
    });

  const professional = db
    .prepare('SELECT id, name, email, role, active, created_at, updated_at FROM users WHERE id = ?')
    .get(result.lastInsertRowid);

  return res.status(201).json(professional);
});

app.patch('/professionals/:id/status', authMiddleware, (req, res) => {
  const professionalId = Number(req.params.id);
  const parsed = statusUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  }

  const existing = db
    .prepare('SELECT id, name, email, role, active FROM users WHERE id = ? AND role = "PROFESSIONAL"')
    .get(professionalId) as User | undefined;

  if (!existing) {
    return res.status(404).json({ message: 'Profesional no encontrado' });
  }

  db.prepare('UPDATE users SET active = @active, updated_at = CURRENT_TIMESTAMP WHERE id = @id').run({
    id: professionalId,
    active: parsed.data.active ? 1 : 0,
  });

  const updated = db
    .prepare('SELECT id, name, email, role, active, created_at, updated_at FROM users WHERE id = ?')
    .get(professionalId);

  return res.json(updated);
});

// Appointments
app.get('/appointments', authMiddleware, (req, res) => {
  const parsedQuery = availabilityQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    return res.status(400).json({ errors: parsedQuery.error.flatten().fieldErrors });
  }

  const { from, to, professional_id } = parsedQuery.data;

  if (from && !isValidDate(from)) {
    return res.status(400).json({ message: 'Fecha inicial inválida' });
  }

  if (to && !isValidDate(to)) {
    return res.status(400).json({ message: 'Fecha final inválida' });
  }

  const professionalIdNumber = professional_id ? Number(professional_id) : undefined;
  if (professional_id && Number.isNaN(professionalIdNumber)) {
    return res.status(400).json({ message: 'ID de profesional inválido' });
  }

  const filters: string[] = [];
  const params: Record<string, unknown> = {};

  if (from) {
    filters.push('start_datetime >= @from');
    params.from = toIso(from);
  }

  if (to) {
    filters.push('start_datetime <= @to');
    params.to = toIso(to);
  }

  if (professionalIdNumber) {
    filters.push('professional_user_id = @professionalId');
    params.professionalId = professionalIdNumber;
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `SELECT a.*, c.name AS client_name, c.phone AS client_phone, s.name AS service_name, u.name AS professional_name
       FROM appointments a
       JOIN clients c ON a.client_id = c.id
       JOIN services s ON a.service_id = s.id
       JOIN users u ON a.professional_user_id = u.id
       ${whereClause}
       ORDER BY a.start_datetime ASC`
    )
    .all(params);

  return res.json(rows);
});

app.post('/appointments', authMiddleware, (req, res) => {
  const parsed = appointmentCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  }

  const data = parsed.data;

  if (!isValidDate(data.start_datetime)) {
    return res.status(400).json({ message: 'Fecha y hora inválidas' });
  }

  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(data.client_id) as Client | undefined;
  if (!client) {
    return res.status(404).json({ message: 'Cliente no encontrado' });
  }

  const service = db.prepare('SELECT * FROM services WHERE id = ?').get(data.service_id) as
    | Service
    | undefined;
  if (!service) {
    return res.status(404).json({ message: 'Servicio no encontrado' });
  }

  const professional = db.prepare('SELECT * FROM users WHERE id = ?').get(data.professional_user_id) as
    | User
    | undefined;
  if (!professional || professional.role !== 'PROFESSIONAL' || professional.active !== 1) {
    return res.status(400).json({ message: 'Profesional inválido o inactivo' });
  }

  const startIso = toIso(data.start_datetime);
  const durationMin = data.duration_min ?? service.duration_min;
  const status: AppointmentStatus = data.status ?? 'RESERVED';

  if (!allowedCreationStatuses.includes(status)) {
    return res.status(400).json({ message: 'Estado inicial inválido' });
  }

  if (hasOverlap({ professionalId: data.professional_user_id, startIso, durationMin })) {
    return res.status(409).json({ message: 'El horario se superpone con otro turno' });
  }

  const createdBy = req.user?.sub ?? null;

  const insert = db.prepare(`
    INSERT INTO appointments (
      client_id, service_id, professional_user_id, start_datetime, duration_min,
      price_estimated, deposit_amount, status, notes, created_by
    ) VALUES (@client_id, @service_id, @professional_user_id, @start_datetime, @duration_min,
              @price_estimated, @deposit_amount, @status, @notes, @created_by)
  `);

  const result = insert.run({
    client_id: data.client_id,
    service_id: data.service_id,
    professional_user_id: data.professional_user_id,
    start_datetime: startIso,
    duration_min: durationMin,
    price_estimated: data.price_estimated ?? null,
    deposit_amount: data.deposit_amount ?? null,
    status,
    notes: data.notes ?? null,
    created_by: createdBy,
  });

  const created = db.prepare('SELECT * FROM appointments WHERE id = ?').get(result.lastInsertRowid);
  return res.status(201).json(created);
});

app.patch('/appointments/:id', authMiddleware, (req, res) => {
  const appointmentId = Number(req.params.id);
  if (Number.isNaN(appointmentId)) {
    return res.status(400).json({ message: 'ID inválido' });
  }

  const parsed = appointmentUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  }

  const appointment = db.prepare('SELECT * FROM appointments WHERE id = ?').get(appointmentId) as
    | Appointment
    | undefined;
  if (!appointment) {
    return res.status(404).json({ message: 'Turno no encontrado' });
  }

  const serviceId = parsed.data.service_id ?? appointment.service_id;
  const service = db.prepare('SELECT * FROM services WHERE id = ?').get(serviceId) as Service | undefined;
  if (!service) {
    return res.status(404).json({ message: 'Servicio no encontrado' });
  }

  const professionalId = parsed.data.professional_user_id ?? appointment.professional_user_id;
  const professional = db.prepare('SELECT * FROM users WHERE id = ?').get(professionalId) as
    | User
    | undefined;
  if (!professional || professional.role !== 'PROFESSIONAL' || professional.active !== 1) {
    return res.status(400).json({ message: 'Profesional inválido o inactivo' });
  }

  let startDatetime = appointment.start_datetime;
  if (parsed.data.start_datetime) {
    if (!isValidDate(parsed.data.start_datetime)) {
      return res.status(400).json({ message: 'Fecha y hora inválidas' });
    }
    startDatetime = toIso(parsed.data.start_datetime);
  }

  const durationMin = parsed.data.duration_min ?? appointment.duration_min ?? service.duration_min;

  if (
    hasOverlap({
      professionalId,
      startIso: startDatetime,
      durationMin,
      ignoreAppointmentId: appointmentId,
    })
  ) {
    return res.status(409).json({ message: 'El horario se superpone con otro turno' });
  }

  db.prepare(
    `UPDATE appointments
     SET start_datetime = @start_datetime,
         duration_min = @duration_min,
         professional_user_id = @professional_user_id,
         service_id = @service_id,
         price_estimated = COALESCE(@price_estimated, price_estimated),
         deposit_amount = COALESCE(@deposit_amount, deposit_amount),
         notes = COALESCE(@notes, notes),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = @id`
  ).run({
    id: appointmentId,
    start_datetime: startDatetime,
    duration_min: durationMin,
    professional_user_id: professionalId,
    service_id: serviceId,
    price_estimated: parsed.data.price_estimated ?? undefined,
    deposit_amount: parsed.data.deposit_amount ?? undefined,
    notes: parsed.data.notes ?? undefined,
  });

  const updated = db.prepare('SELECT * FROM appointments WHERE id = ?').get(appointmentId);
  return res.json(updated);
});

app.patch('/appointments/:id/status', authMiddleware, (req, res) => {
  const appointmentId = Number(req.params.id);
  if (Number.isNaN(appointmentId)) {
    return res.status(400).json({ message: 'ID inválido' });
  }

  const parsed = appointmentStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  }

  const appointment = db.prepare('SELECT * FROM appointments WHERE id = ?').get(appointmentId) as
    | Appointment
    | undefined;
  if (!appointment) {
    return res.status(404).json({ message: 'Turno no encontrado' });
  }

  const nextStatus: AppointmentStatus = parsed.data.status;
  const allowed = allowedStatusTransitions[appointment.status];
  if (!allowed.includes(nextStatus)) {
    return res.status(400).json({ message: 'Transición de estado no permitida' });
  }

  db.prepare('UPDATE appointments SET status = @status, updated_at = CURRENT_TIMESTAMP WHERE id = @id').run({
    id: appointmentId,
    status: nextStatus,
  });

  const updated = db.prepare('SELECT * FROM appointments WHERE id = ?').get(appointmentId);
  return res.json(updated);
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  return res.status(500).json({ message: 'Error inesperado' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API de gestión de salón escuchando en puerto ${PORT}`);
});
