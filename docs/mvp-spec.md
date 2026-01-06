# 📱 App Gestión Salón – Especificación MVP (Fase 1)

## 1. Objetivo general
Desarrollar una aplicación web (responsive) para la gestión integral de turnos de un salón de peluquería. El MVP se centra en la agenda: crear, editar, cancelar y reprogramar turnos; gestionar clientes y servicios; y visualizar la agenda en múltiples vistas. Debe ser simple, rápida y preparada para escalar (WhatsApp, Google Calendar, stock, finanzas).

## 2. Usuarios y roles
- **Admin** (p. ej. Brenda / Fer): control total.
- **Profesional**: ve y gestiona solo sus turnos (fase futura, pero el modelo debe soportarlo).
- Capacidad de agregar, editar y desactivar profesionales.

## 3. Pantallas obligatorias del MVP
### 3.1 Login
- Email + contraseña, autenticación con JWT.
- Redirección al Dashboard al autenticarse.

### 3.2 Dashboard ("Hoy")
- Próximo turno: hora, cliente, servicio, estado.
- Lista de turnos del día.
- Acciones rápidas: ➕ Nuevo turno, 📅 Agenda, 👩‍🦰 Clientes, ✂️ Servicios.

### 3.3 Agenda
- Vistas de día, semana y mes en bloques de 15 minutos.
- Colores por profesional y filtro por profesional.
- No permitir superposición de turnos por profesional.
- Click en turno → ficha; click en horario libre → nuevo turno.

### 3.4 Turnos – Crear / Editar
Campos obligatorios: cliente (búsqueda por nombre/teléfono), servicio (1 en MVP), profesional, fecha, hora inicio, duración (autocompletada desde servicio, editable), precio estimado (opcional), seña (opcional), notas (opcional).

Botones: **Guardar (Reservado)** y **Guardar y confirmar (Confirmado)**.

### 3.5 Estados del turno
- Posibles: Reservado, Confirmado, En proceso, Finalizado, Cancelado, No vino.
- Estado inicial: Reservado. "Guardar y confirmar" → Confirmado.
- No permitir Finalizado sin pasar por En proceso (opcional en MVP pero contemplado).

### 3.6 Ficha de turno
Muestra cliente, servicio, profesional, fecha y hora, duración, precio estimado, estado.

Acciones rápidas: Confirmar, Reprogramar, Cancelar, Marcar "Llegó", Marcar "Finalizado".

### 3.7 Clientes
- Listado con buscador.
- Crear/editar cliente.
- Campos: nombre y apellido, teléfono (único), Instagram (opcional), notas, historial de turnos.

### 3.8 Servicios (catálogo)
- Listado de servicios, ➕ agregar, editar y desactivar.
- Campos: nombre, duración (horas + minutos → guardar en minutos), precio base (opcional), buffer (opcional), estado (activo/inactivo).
- Servicios iniciales:

| Servicio  | Duración          |
| --------- | ----------------- |
| Balayage  | 8 horas (480 min) |
| Alisado   | 4 horas (240 min) |
| Nutrición | 2 horas (120 min) |

- Editar servicios no afecta turnos ya creados.

## 4. Reglas de agenda
- Turnos largos bloquean la franja completa (p. ej. Balayage 9:00–17:00).
- No permitir superposición por profesional.
- Advertencia si el turno excede horario laboral (configurable).

## 5. Modelo de datos base
- **User**: `id`, `name`, `email`, `password_hash`, `role`, `active`, timestamps.
- **Client**: `id`, `name`, `phone` (único), `instagram`, `notes`, timestamps.
- **Service**: `id`, `name`, `duration_min`, `price_base`, `buffer_min`, `active`, timestamps.
- **Appointment**: `id`, `client_id`, `service_id`, `professional_user_id`, `start_datetime`, `duration_min`, `price_estimated`, `deposit_amount`, `status`, `notes`, `created_by`, timestamps.

## 6. Lineamientos técnicos
- App web responsive (mobile-first).
- Backend con API REST.
- Base de datos relacional (PostgreSQL).
- Autenticación JWT.
- Preparar estructura para futuras integraciones: WhatsApp API, Google Calendar Sync, notificaciones, stock, finanzas.

## 7. Alcance futuro (no implementar en fase 1)
- WhatsApp automático (cotizaciones y confirmaciones), recordatorios 48h/24h, sincronización Google Calendar, control de stock, caja diaria/ganancias, comisiones de asistentes.

## 8. Prioridad del MVP
- Usabilidad y rapidez (2–3 clics máximo), sin pantallas innecesarias, evitar superposición de turnos y errores.

## 9. Propuesta de arquitectura inicial
- **Frontend**: SPA responsive (React/Next.js o similar) con componentes de calendario (vista día/semana/mes) y formularios rápidos. Estado global con React Query/Zustand para cachear datos de API.
- **Backend**: API REST en Node.js (NestJS/Express) o similar, con validación, autenticación JWT y políticas de acceso por rol.
- **Base de datos**: PostgreSQL con migraciones (Prisma/TypeORM/Knex). Índices en `appointments.start_datetime`, `appointments.professional_user_id`, `clients.phone`.
- **Infra**: Despliegue containerizado (Docker), servidor en 0.0.0.0, soporte para variables de entorno (DB_URL, JWT_SECRET, etc.).

## 10. Sugerencia de endpoints REST
- `POST /auth/login`: email + password → JWT.
- `GET /me`: perfil autenticado.
- **Clientes**: `GET/POST /clients`, `GET/PUT/PATCH /clients/:id`, `GET /clients/search?query=`.
- **Servicios**: `GET/POST /services`, `GET/PUT/PATCH /services/:id`, `PATCH /services/:id/status`.
- **Profesionales**: `GET/POST /professionals`, `PATCH /professionals/:id/status`.
- **Turnos**:
  - `GET /appointments?from=&to=&professional_id=`
  - `POST /appointments` (crea con estado Reservado o Confirmado según acción).
  - `PATCH /appointments/:id` (reprogramar: cambia `start_datetime` y `duration_min`).
  - `PATCH /appointments/:id/status` (Reservado → Confirmado → En proceso → Finalizado | Cancelado | No vino).
- **Reglas de negocio**: middleware/servicio que valida superposición por profesional y límites de horario laboral.

## 11. Métricas y analítica futuras (referencial)
- Tiempo promedio entre Reservado y Confirmado.
- Tasa de cancelaciones/no-show por profesional y servicio.
- Utilización de agenda por franja horaria.

## 12. Checklist de entregables del MVP
- Autenticación JWT funcional y redirección a dashboard.
- Dashboard con próximo turno y lista diaria.
- Agenda con vistas día/semana/mes en bloques de 15 minutos, filtro por profesional, sin superposición.
- ABM de turnos con estados y reprogramación.
- ABM de clientes y servicios (duración en minutos, estados activo/inactivo).
- Validaciones de colisión y advertencias de horario laboral.
