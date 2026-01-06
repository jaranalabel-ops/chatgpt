# App Gestión Salón – MVP (Fase 1)

Documentación base y API MVP para la agenda de un salón de peluquería. El objetivo es construir una aplicación web responsive que permita crear y gestionar turnos, clientes, servicios y profesionales, con un backend REST y base de datos relacional (SQLite para desarrollo local, preparada para Postgres).

## Contenido

- [docs/mvp-spec.md](docs/mvp-spec.md): Requerimientos detallados, modelo de datos y lineamientos técnicos.
- API Express (TypeScript) con base de datos SQLite (persistencia local y seed inicial).

## Cómo ejecutar la API

Requisitos: Node.js 18+ y npm.

```bash
npm install
cp .env.example .env   # opcional: personalizar DB_PATH o JWT_SECRET
npm run build          # compila TypeScript
npm start              # levanta la API en el puerto 3000 por defecto
```

Durante el desarrollo puedes usar `npm run dev` para recarga en caliente.

### Credenciales de prueba

Se generan automáticamente en la base de datos local:

- Admin: `admin@salon.com` / `password123`
- Profesional: `brenda@salon.com` / `profesional123`

### Endpoints principales (JWT requerido salvo login y health)

- `GET /health`: chequeo simple.
- `POST /auth/login`: email + password → JWT.
- `GET /me`: devuelve el usuario autenticado.
- Clientes: `GET /clients`, `POST /clients`, `PATCH /clients/:id`.
- Servicios: `GET /services`, `POST /services`, `PUT /services/:id`, `PATCH /services/:id/status`.
- Profesionales: `GET /professionals`, `POST /professionals`, `PATCH /professionals/:id/status`.
- Turnos: `GET /appointments?from=&to=&professional_id=`, `POST /appointments`, `PATCH /appointments/:id`, `PATCH /appointments/:id/status`.

La API valida solapamiento de turnos por profesional y permite transiciones de estado según el flujo: Reservado → Confirmado → En proceso → Finalizado | Cancelado | No vino.
