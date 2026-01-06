import { z } from 'zod';
import { AppointmentStatus, Role } from './types';

export const roleEnum = z.enum(['ADMIN', 'PROFESSIONAL']);

export const appointmentStatusEnum = z.enum([
  'RESERVED',
  'CONFIRMED',
  'IN_PROCESS',
  'FINALIZED',
  'CANCELLED',
  'NO_SHOW',
]);

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const clientSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(5),
  instagram: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export const updateClientSchema = clientSchema.partial();

export const serviceSchema = z.object({
  name: z.string().min(1),
  duration_min: z.number().int().positive(),
  price_base: z.number().nonnegative().optional(),
  buffer_min: z.number().int().nonnegative().optional(),
  active: z.boolean().optional(),
});

export const updateServiceSchema = serviceSchema.partial();

export const professionalSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: roleEnum.default('PROFESSIONAL'),
  active: z.boolean().optional(),
});

export const statusUpdateSchema = z.object({
  active: z.boolean(),
});

export const appointmentCreateSchema = z.object({
  client_id: z.number().int().positive(),
  service_id: z.number().int().positive(),
  professional_user_id: z.number().int().positive(),
  start_datetime: z.string().min(1),
  duration_min: z.number().int().positive().optional(),
  price_estimated: z.number().nonnegative().optional(),
  deposit_amount: z.number().nonnegative().optional(),
  status: appointmentStatusEnum.optional(),
  notes: z.string().trim().optional(),
});

export const appointmentUpdateSchema = z.object({
  start_datetime: z.string().min(1).optional(),
  duration_min: z.number().int().positive().optional(),
  professional_user_id: z.number().int().positive().optional(),
  service_id: z.number().int().positive().optional(),
  price_estimated: z.number().nonnegative().optional(),
  deposit_amount: z.number().nonnegative().optional(),
  notes: z.string().trim().optional(),
});

export const appointmentStatusSchema = z.object({
  status: appointmentStatusEnum,
});

export const availabilityQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  professional_id: z.string().optional(),
});

export type ParsedRole = z.infer<typeof roleEnum>;
export type ParsedAppointmentStatus = z.infer<typeof appointmentStatusEnum>;
