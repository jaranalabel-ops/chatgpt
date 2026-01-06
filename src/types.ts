export type Role = 'ADMIN' | 'PROFESSIONAL';

export type AppointmentStatus =
  | 'RESERVED'
  | 'CONFIRMED'
  | 'IN_PROCESS'
  | 'FINALIZED'
  | 'CANCELLED'
  | 'NO_SHOW';

export interface User {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  role: Role;
  active: number;
  created_at: string;
  updated_at: string;
}

export interface Client {
  id: number;
  name: string;
  phone: string;
  instagram: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Service {
  id: number;
  name: string;
  duration_min: number;
  price_base: number | null;
  buffer_min: number | null;
  active: number;
  created_at: string;
  updated_at: string;
}

export interface Appointment {
  id: number;
  client_id: number;
  service_id: number;
  professional_user_id: number;
  start_datetime: string;
  duration_min: number;
  price_estimated: number | null;
  deposit_amount: number | null;
  status: AppointmentStatus;
  notes: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}
