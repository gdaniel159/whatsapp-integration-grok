# 01 — Auth / Autenticación

## Alcance MVP
Un único usuario admin sembrado. Login con username/password → JWT access token.

## Endpoints
| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/auth/login` | No | `{ username, password }` → `{ accessToken, user }` |
| GET | `/auth/me` | Bearer JWT | Usuario actual |

## Reglas
- Password hasheado con **bcrypt** (cost 10).
- JWT payload: `{ sub: userId, username }`.
- Secret: `JWT_SECRET` en env. Expiración: `JWT_EXPIRES_IN` (default `7d`).
- Seed: `admin` / `Admin123!` — ver `SEED_CREDENTIALS.md`.

## Web
- `/login`: formulario; guarda token (cookie httpOnly preferible o localStorage + Authorization header).
- Middleware Next: redirigir a `/login` si no hay sesión en rutas protegidas (`/`).
- API client: header `Authorization: Bearer <token>`.

## Seguridad
- No exponer `passwordHash`.
- CORS: origen `http://localhost:3000`.
