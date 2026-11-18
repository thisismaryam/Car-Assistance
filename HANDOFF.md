# Car Assistance — Project Handoff Document

> **Prepared for:** Incoming Developer  
> **Prepared by:** Senior Engineer (Handoff)  
> **Date:** 2026-11-18  
> **Status:** Complete — ready for immediate takeover

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture Diagram](#2-architecture-diagram)
3. [Repository Structure](#3-repository-structure)
4. [Prerequisites & Environment Setup](#4-prerequisites--environment-setup)
5. [Environment Variables](#5-environment-variables)
6. [Running the Application](#6-running-the-application)
7. [Database Schema](#7-database-schema)
8. [API Reference](#8-api-reference)
9. [Feature Inventory](#9-feature-inventory)
10. [Frontend Route Map](#10-frontend-route-map)
11. [User Roles & Permissions](#11-user-roles--permissions)
12. [AI Assistant Deep Dive](#12-ai-assistant-deep-dive)
13. [Availability Engine Deep Dive](#13-availability-engine-deep-dive)
14. [WebSocket Architecture](#14-websocket-architecture)
15. [Email Notifications](#15-email-notifications)
16. [Known Issues & Technical Debt](#16-known-issues--technical-debt)
17. [Operational Runbook](#17-operational-runbook)
18. [Development Notes](#18-development-notes)

---

## 1. Project Overview

**Car Assistance** is a full-stack web application for an automotive service business. It allows customers to book vehicle maintenance and repair services either at a physical workshop or via home-service visits, and to request emergency roadside assistance. Business administrators manage service offerings, mechanic schedules, and booking assignments through a separate admin portal. An AI-powered chat assistant is embedded site-wide to handle customer queries and guide them through the booking flow conversationally.

### Business Domain

| Capability | Description |
|---|---|
| Workshop bookings | Customer schedules a service at the physical workshop; slot availability is enforced per bay capacity |
| Home service bookings | Mechanic dispatched to customer's address; availability is per-mechanic with travel buffers |
| Roadside / emergency dispatch | Customer triggers an SOS; admin assigns a mechanic; real-time status pushed via WebSocket |
| AI chat assistant | Conversational interface: answers FAQs, retrieves live pricing/availability, executes bookings |
| Admin panel | Full CRUD over services, mechanics, bookings, and roadside requests |

### Tech Stack Summary

| Layer | Technology |
|---|---|
| **Backend language** | Python 3.14 |
| **API framework** | FastAPI (async) |
| **ORM** | SQLAlchemy 2.x (async, `asyncpg` / `psycopg` driver) |
| **Database** | PostgreSQL (port 2004) |
| **Migrations** | Alembic (installed, **not used** — schema managed via `create_all`) |
| **Auth** | JWT (HS256) via `python-jose`; passwords hashed with `passlib[bcrypt]` |
| **Settings** | `pydantic-settings` reading from `.env` |
| **Frontend framework** | Next.js 16.4.6 (App Router) |
| **UI language** | TypeScript 5 |
| **Styling** | Tailwind CSS 4.3.3, Turbopack |
| **React version** | 19.3.0 |
| **State management** | None (no Redux, Zustand, or Context API — raw `localStorage` + per-page fetch) |
| **Real-time** | Native WebSocket (backend) / browser `WebSocket` API (frontend) |

---

## 2. Architecture Diagram

```mermaid
flowchart TD
    Browser["Browser\n(Next.js — localhost:3000)"]

    subgraph Frontend["Next.js App Router"]
        PublicPages["Public Pages\n/ /services /emergency"]
        DashPages["Customer Dashboard\n/dashboard/*"]
        AdminPages["Admin Panel\n/admin/*"]
        Chat["ChatWidget\n(floating, all non-admin routes)"]
    end

    subgraph Backend["FastAPI — localhost:8000"]
        Auth["/auth\nJWT login & register"]
        Services["/services\nService catalog"]
        Vehicles["/vehicles\nVehicle CRUD"]
        Bookings["/bookings\nBooking lifecycle"]
        Roadside["/roadside\nEmergency dispatch"]
        Mechanics["/admin/mechanics\nMechanic management"]
        ChatAPI["/api/chat\nAI assistant"]
        WSAdmin["WS /roadside/ws/admin"]
        WSCustomer["WS /roadside/ws/customer/{id}"]
    end

    subgraph AI["AI Layer (rule-based)"]
        Orchestrator["Orchestrator\n(intent classifier)"]
        RAG["GroundedRAG\n(TF scoring, no embeddings)"]
        LiveTools["Live Tools\n(DB pricing & availability)"]
        BookingFlow["Booking Flow\n(conversational executor)"]
    end

    DB[("PostgreSQL\nlocalhost:2004\ncar_assistance")]

    Browser --> PublicPages
    Browser --> DashPages
    Browser --> AdminPages
    Browser --> Chat

    PublicPages -->|"fetch() HTTP"| Auth
    PublicPages -->|"fetch() HTTP"| Services
    DashPages -->|"fetch() HTTP + JWT"| Vehicles
    DashPages -->|"fetch() HTTP + JWT"| Bookings
    DashPages -->|"WebSocket"| WSCustomer
    AdminPages -->|"fetch() HTTP + JWT"| Bookings
    AdminPages -->|"fetch() HTTP + JWT"| Mechanics
    AdminPages -->|"fetch() HTTP + JWT"| Services
    AdminPages -->|"fetch() HTTP + JWT"| Roadside
    AdminPages -->|"WebSocket"| WSAdmin
    Chat -->|"fetch() HTTP (optional JWT)"| ChatAPI

    Auth --> DB
    Services --> DB
    Vehicles --> DB
    Bookings --> DB
    Roadside --> DB
    Mechanics --> DB
    ChatAPI --> Orchestrator

    Orchestrator --> RAG
    Orchestrator --> LiveTools
    Orchestrator --> BookingFlow
    LiveTools --> DB
    BookingFlow --> DB
```

---

## 3. Repository Structure

```
e:\CarAssistance\
│
├── backend/                        # FastAPI application
│   ├── .env                        # ⚠ All secrets — do NOT commit
│   ├── requirements.txt            # Python dependencies
│   ├── .venv/                      # Virtual environment (not committed)
│   │
│   └── app/
│       ├── main.py                 # FastAPI app factory, router mounts, CORS, DB init
│       ├── database.py             # Async SQLAlchemy engine + session factory
│       │
│       ├── core/
│       │   ├── config.py           # Pydantic Settings (reads .env)
│       │   └── security.py        # JWT create/decode, password hash/verify, auth dependencies
│       │
│       ├── models/                 # SQLAlchemy ORM table definitions
│       │   ├── user.py             # User + UserRole enum
│       │   ├── vehicle.py          # Vehicle
│       │   ├── booking.py          # Booking + BookingStatus enum + Service + ServiceType enum
│       │   ├── mechanic.py         # MechanicSchedule, MechanicTimeOff
│       │   └── roadside.py        # RoadsideRequest, RoadsideAssignment
│       │
│       ├── schemas/                # Pydantic v2 request/response models
│       │   ├── auth.py             # UserCreate, UserLogin, Token, UserResponse
│       │   ├── vehicle.py          # VehicleCreate, VehicleResponse
│       │   ├── booking.py          # BookingCreate, BookingResponse, AvailabilitySlot
│       │   ├── mechanic.py         # MechanicResponse, ScheduleCreate, TimeOffCreate
│       │   └── roadside.py        # RoadsideRequestCreate, RoadsideRequestResponse
│       │
│       ├── api/
│       │   └── endpoints/
│       │       ├── auth.py         # /auth routes
│       │       ├── services.py     # /services routes
│       │       ├── vehicles.py     # /vehicles routes
│       │       ├── bookings.py     # /bookings routes + availability engine call
│       │       ├── mechanics.py    # /admin/mechanics + /mechanics routes
│       │       ├── roadside.py     # /roadside routes + WebSocket handlers
│       │       └── chat.py         # /api/chat + /chat routes
│       │
│       ├── services/               # Business logic layer
│       │   ├── availability.py     # Slot generation, capacity checks, advisory locks
│       │   ├── roadside_dispatch.py# Mechanic assignment for roadside + WS broadcast
│       │   └── ai/
│       │       ├── orchestrator.py # Intent classifier + booking executor
│       │       ├── rag.py          # GroundedRAGRetriever (TF scoring)
│       │       └── tools.py        # Live DB tool functions used by orchestrator
│       │
│       ├── knowledge/
│       │   └── approved_knowledge.py # Static FAQ/policy documents for RAG
│       │
│       └── utils/
│           └── email.py            # SMTP email sender (with simulation fallback)
│
└── frontend/                       # Next.js 16 application
    ├── package.json
    ├── tsconfig.json
    ├── next.config.ts
    ├── tailwind.config.ts
    │
    └── src/
        ├── app/                    # Next.js App Router pages
        │   ├── layout.tsx          # Root layout (global font, metadata)
        │   ├── page.tsx            # Landing page (public)
        │   ├── globals.css         # Tailwind base styles
        │   ├── login/page.tsx      # Customer login (no registration form yet)
        │   ├── services/page.tsx   # Public service catalog
        │   ├── emergency/page.tsx  # Roadside SOS + real-time tracking
        │   │
        │   ├── dashboard/          # Authenticated customer area
        │   │   ├── layout.tsx      # Sidebar nav + auth guard
        │   │   ├── page.tsx        # Workshop booking wizard (default tab)
        │   │   ├── home-service/page.tsx  # Home service booking form
        │   │   ├── vehicles/page.tsx      # Garage management
        │   │   ├── bookings/page.tsx      # Booking history list
        │   │   └── bookings/[id]/page.tsx # Booking detail view
        │   │
        │   └── admin/              # Admin-only area
        │       ├── layout.tsx      # Admin sidebar + role guard (redirects non-admins)
        │       ├── page.tsx        # Admin overview dashboard
        │       ├── login/page.tsx  # Admin login (same backend endpoint)
        │       ├── bookings/page.tsx      # Booking management + mechanic assignment
        │       ├── mechanics/page.tsx     # Mechanic CRUD + schedule management
        │       ├── services/page.tsx      # Service CRUD
        │       └── roadside/page.tsx      # Live roadside dispatch console
        │
        └── components/
            ├── ChatWidget.tsx      # Floating AI chat bubble (all non-admin pages)
            └── VehicleForm.tsx     # Reusable vehicle form — ⚠ NOT USED (dead code)
```

---

## 4. Prerequisites & Environment Setup

### System Requirements

| Requirement | Version / Notes |
|---|---|
| Python | 3.14 (match the runtime used in development) |
| Node.js | 20+ (compatible with Next.js 16 / React 19) |
| PostgreSQL | Running on **port 2004** (non-standard — ensure your install uses this port) |
| Git | Any modern version |

### Step 1 — Clone & verify

```powershell
cd e:\CarAssistance
# Confirm both backend/ and frontend/ directories are present
dir
```

### Step 2 — Set up PostgreSQL

The application expects a database on **port 2004**, not the default 5432. If you are using the default PostgreSQL port you must either reconfigure PostgreSQL or update `DATABASE_URL` in `backend/.env`.

```sql
-- Connect as superuser
CREATE USER car_assistance_user WITH PASSWORD 'car_assistance_pass';
CREATE DATABASE car_assistance OWNER car_assistance_user;
GRANT ALL PRIVILEGES ON DATABASE car_assistance TO car_assistance_user;
```

### Step 3 — Backend setup

```powershell
cd e:\CarAssistance\backend

# Create and activate virtual environment
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt
```

> **Note:** There is no `requirements.txt` checked in the codebase root that was verified during this handoff — if one is missing, the key packages are: `fastapi`, `uvicorn[standard]`, `sqlalchemy[asyncio]`, `psycopg[binary]`, `asyncpg`, `alembic`, `pydantic`, `pydantic-settings`, `python-jose[cryptography]`, `passlib[bcrypt]`, `python-multipart`, `httpx`.

### Step 4 — Frontend setup

```powershell
cd e:\CarAssistance\frontend
npm install
```

### Step 5 — Database initialisation

There are **no migration scripts**. Tables are created automatically when the backend starts, via SQLAlchemy's `Base.metadata.create_all(engine)` call in `app/main.py` on the `startup` lifecycle event. Simply start the backend (see §6) and all tables will be created on first run.

---

## 5. Environment Variables

The file `backend/.env` contains all runtime configuration. It is read by `app/core/config.py` using `pydantic-settings`.

```dotenv
# backend/.env  (current values as of handoff)

DATABASE_URL=postgresql+psycopg://car_assistance_user:car_assistance_pass@localhost:2004/car_assistance

SECRET_KEY=change-this-later-to-a-random-64-char-string

ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=10080

# SMTP — if absent, email notifications print to console
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
FROM_EMAIL=noreply@carassistance.com

GROQ_API_KEY=gsk_REDACTED_GROQ_API_KEY_HERE
```

> [!CAUTION]
> **TWO CRITICAL SECURITY ISSUES must be fixed before any production deployment:**
>
> 1. **`SECRET_KEY` is a placeholder string.** All existing JWTs will be invalid after rotation, logging out all users. Generate a secure key: `python -c "import secrets; print(secrets.token_hex(32))"` and replace the value.
> 2. **`GROQ_API_KEY` is a live API key committed to `.env`.** This key must be rotated immediately via the GROQ console and the new key stored in a secrets manager, not in a committed file. Add `.env` to `.gitignore` if not already present.

**Variable reference:**

| Variable | Purpose | Required |
|---|---|---|
| `DATABASE_URL` | Async SQLAlchemy connection string | ✅ Yes |
| `SECRET_KEY` | HMAC-HS256 JWT signing key | ✅ Yes |
| `ALGORITHM` | JWT algorithm (always HS256) | ✅ Yes |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Token lifetime (10080 = 7 days) | ✅ Yes |
| `SMTP_HOST` | SMTP server hostname | ❌ Optional |
| `SMTP_PORT` | SMTP server port | ❌ Optional |
| `SMTP_USER` | SMTP username | ❌ Optional |
| `SMTP_PASSWORD` | SMTP password | ❌ Optional |
| `FROM_EMAIL` | Sender address for notifications | ❌ Optional |
| `GROQ_API_KEY` | GROQ LLM API key (configured but **not called** at runtime) | ❌ Not used |

---

## 6. Running the Application

There is no Docker Compose or any container setup. Both processes must be started manually in separate terminals.

### Backend

```powershell
cd e:\CarAssistance\backend
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000
```

- API base: `http://localhost:8000`
- Interactive docs: `http://localhost:8000/docs` (Swagger UI)
- Redoc: `http://localhost:8000/redoc`
- Health check: `http://localhost:8000/health`

### Frontend

```powershell
cd e:\CarAssistance\frontend
npm run dev
```

- App URL: `http://localhost:3000`
- Uses Turbopack; hot reload is enabled for frontend code.

> **Note:** The backend does **not** hot-reload SQLAlchemy model changes. If you add or modify a database model, you must restart the backend manually and drop/recreate the affected tables (since `create_all` only creates new tables; it does not apply column-level changes to existing ones).

> [!IMPORTANT]
> CORS is **hardcoded** in `backend/app/main.py` to allow only `http://localhost:3000`. If you change the frontend port you must update the `allow_origins` list in `main.py` as well.

---

## 7. Database Schema

Tables are defined in `backend/app/models/`. All are created via `Base.metadata.create_all()` on startup. There are no Alembic migration files.

---

### 7.1 `users`

| Column | Type | Constraints |
|---|---|---|
| `id` | Integer | PK, auto-increment |
| `full_name` | String | NOT NULL |
| `email` | String | UNIQUE, NOT NULL, indexed |
| `phone` | String | nullable |
| `hashed_password` | String | NOT NULL |
| `role` | Enum(`UserRole`) | NOT NULL, default `customer` |
| `is_active` | Boolean | default `true` |
| `created_at` | DateTime (tz) | default `utcnow` |

**`UserRole` enum values:** `customer`, `admin`, `mechanic`

---

### 7.2 `vehicles`

| Column | Type | Constraints |
|---|---|---|
| `id` | Integer | PK |
| `owner_id` | Integer | FK → `users.id` ON DELETE CASCADE |
| `make` | String | NOT NULL |
| `model` | String | NOT NULL |
| `year` | Integer | NOT NULL |
| `registration` | String | UNIQUE, NOT NULL |
| `notes` | Text | nullable |
| `created_at` | DateTime (tz) | default `utcnow` |

---

### 7.3 `services`

| Column | Type | Constraints |
|---|---|---|
| `id` | Integer | PK |
| `name` | String | NOT NULL |
| `description` | Text | nullable |
| `service_type` | Enum(`ServiceType`) | NOT NULL |
| `base_price` | Numeric | NOT NULL |
| `duration_minutes` | Integer | NOT NULL |
| `is_active` | Boolean | default `true` |
| `created_at` | DateTime (tz) | default `utcnow` |

**`ServiceType` enum values:** `workshop`, `home`, `roadside`

---

### 7.4 `bookings`

| Column | Type | Constraints |
|---|---|---|
| `id` | Integer | PK |
| `customer_id` | Integer | FK → `users.id` |
| `vehicle_id` | Integer | FK → `vehicles.id` |
| `service_id` | Integer | FK → `services.id` |
| `mechanic_id` | Integer | FK → `users.id` ON DELETE SET NULL, nullable |
| `status` | Enum(`BookingStatus`) | NOT NULL, default `pending` |
| `scheduled_at` | DateTime (tz) | NOT NULL |
| `address` | String | nullable (populated for home service) |
| `notes` | Text | nullable |
| `created_at` | DateTime (tz) | default `utcnow` |
| `updated_at` | DateTime (tz) | auto-updated |

**`BookingStatus` enum values:** `pending`, `confirmed`, `assigned`, `in_progress`, `completed`, `cancelled`

---

### 7.5 `mechanic_schedules`

| Column | Type | Constraints |
|---|---|---|
| `id` | Integer | PK |
| `mechanic_id` | Integer | FK → `users.id` ON DELETE CASCADE |
| `day_of_week` | Integer | 0 = Monday … 6 = Sunday |
| `start_time` | String | "HH:MM" format |
| `end_time` | String | "HH:MM" format |
| `is_active` | Boolean | default `true` |

> **Note:** `start_time` / `end_time` are plain strings, not `TIME` SQL columns. Parsing is done in Python. This is inconsistent with `MechanicTimeOff` which uses timezone-aware datetimes.

---

### 7.6 `mechanic_time_offs`

| Column | Type | Constraints |
|---|---|---|
| `id` | Integer | PK |
| `mechanic_id` | Integer | FK → `users.id` ON DELETE CASCADE |
| `start_time` | DateTime (tz) | NOT NULL |
| `end_time` | DateTime (tz) | NOT NULL |
| `reason` | String | nullable |

---

### 7.7 `roadside_requests`

| Column | Type | Constraints |
|---|---|---|
| `id` | Integer | PK |
| `user_id` | Integer | FK → `users.id` ON DELETE CASCADE |
| `vehicle_id` | Integer | FK → `vehicles.id` ON DELETE SET NULL, nullable |
| `location` | Text | NOT NULL |
| `issue_type` | String | NOT NULL |
| `status` | String | default `requested` |
| `notes` | Text | nullable |
| `assigned_mechanic_id` | Integer | FK → `users.id` ON DELETE SET NULL, nullable |
| `accepted_at` | DateTime (tz) | nullable |
| `assigned_at` | DateTime (tz) | nullable |
| `en_route_at` | DateTime (tz) | nullable |
| `arrived_at` | DateTime (tz) | nullable |
| `resolved_at` | DateTime (tz) | nullable |
| `cancelled_at` | DateTime (tz) | nullable |
| `created_at` | DateTime (tz) | default `utcnow` |
| `updated_at` | DateTime (tz) | auto-updated |

**Status string values (not a DB enum):** `requested`, `accepted`, `assigned`, `en route`, `en_route`, `arrived`, `resolved`, `cancelled`

> [!WARNING]
> There is a **status string inconsistency**: both `"en route"` (with space) and `"en_route"` (with underscore) exist in the codebase. All status checks use `or` conditions to handle both. This must be normalised to a single canonical value before adding a DB-level enum.

---

### 7.8 `roadside_assignments`

| Column | Type | Constraints |
|---|---|---|
| `id` | Integer | PK |
| `request_id` | Integer | FK → `roadside_requests.id` ON DELETE CASCADE |
| `mechanic_id` | Integer | FK → `users.id` ON DELETE CASCADE |
| `assigned_by_id` | Integer | FK → `users.id` ON DELETE SET NULL, nullable |
| `status` | String | default `assigned` |
| `notes` | Text | nullable |
| `created_at` | DateTime (tz) | default `utcnow` |
| `completed_at` | DateTime (tz) | nullable |

**Assignment status values:** `assigned`, `active`, `completed`, `cancelled`

---

### Entity Relationship Overview

```mermaid
erDiagram
    users ||--o{ vehicles : "owns"
    users ||--o{ bookings : "customer_id"
    users ||--o{ bookings : "mechanic_id"
    users ||--o{ mechanic_schedules : "mechanic_id"
    users ||--o{ mechanic_time_offs : "mechanic_id"
    users ||--o{ roadside_requests : "user_id"
    users ||--o{ roadside_requests : "assigned_mechanic_id"
    users ||--o{ roadside_assignments : "mechanic_id"
    users ||--o{ roadside_assignments : "assigned_by_id"
    vehicles ||--o{ bookings : "vehicle_id"
    vehicles ||--o{ roadside_requests : "vehicle_id"
    services ||--o{ bookings : "service_id"
    roadside_requests ||--o{ roadside_assignments : "request_id"
```

---

## 8. API Reference

**Base URL:** `http://localhost:8000`  
**Auth header:** `Authorization: Bearer <token>`  
**Content-Type:** `application/json` (except login which uses `application/x-www-form-urlencoded`)

---

### 8.1 Auth — `/auth`

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/auth/register` | None | Register a new customer account |
| `POST` | `/auth/login` | None | Login; returns JWT token |
| `GET` | `/auth/me` | Bearer | Get current user profile |

**POST `/auth/register`** request body:
```json
{
  "full_name": "Jane Doe",
  "email": "jane@example.com",
  "password": "s3cur3pass",
  "phone": "+1234567890"
}
```
Response: `UserResponse` (id, full_name, email, phone, role, is_active, created_at)

**POST `/auth/login`** — `application/x-www-form-urlencoded`:
```
username=jane@example.com&password=s3cur3pass
```
Response:
```json
{ "access_token": "<jwt>", "token_type": "bearer" }
```

> **Note:** The `username` field in the login form accepts an **email address**, not a username.

---

### 8.2 Services — `/services`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/services/` | None | List all active services; optional `?service_type=workshop\|home\|roadside` |
| `POST` | `/services/` | Admin | Create a new service |

**POST `/services/`** request body:
```json
{
  "name": "Oil Change",
  "description": "Full synthetic oil change",
  "service_type": "workshop",
  "base_price": 49.99,
  "duration_minutes": 60
}
```

---

### 8.3 Vehicles — `/vehicles`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/vehicles/my-vehicles` | Bearer | List vehicles belonging to the authenticated user |
| `POST` | `/vehicles/` | Bearer | Add a new vehicle |
| `DELETE` | `/vehicles/{id}` | Bearer | Delete a vehicle (only if owned by user) |

**POST `/vehicles/`** request body:
```json
{
  "make": "Toyota",
  "model": "Corolla",
  "year": 2020,
  "registration": "ABC-1234",
  "notes": "Red, dented rear bumper"
}
```

---

### 8.4 Bookings — `/bookings`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/bookings/availability` | None | Get available time slots |
| `POST` | `/bookings/` | Bearer | Create a booking |
| `GET` | `/bookings/my` | Bearer | List current user's bookings |
| `GET` | `/bookings/all` | Admin | List all bookings system-wide |
| `GET` | `/bookings/{id}` | Bearer | Get booking detail (owner or admin) |
| `PATCH` | `/bookings/{id}/assign` | Admin | Assign a mechanic to a booking |
| `PATCH` | `/bookings/{id}/cancel` | Bearer | Cancel a booking (owner or admin) |
| `PATCH` | `/bookings/{id}/status` | Admin | Update booking status to any value |

**GET `/bookings/availability`** query parameters:
- `service_id` (int, required)
- `date` (string, required, format: `YYYY-MM-DD`)

Response: list of `AvailabilitySlot` objects — each has `start_time`, `end_time`, `available` (bool), `capacity_remaining` (int).

**POST `/bookings/`** request body:
```json
{
  "service_id": 1,
  "vehicle_id": 3,
  "scheduled_at": "2026-11-25T10:00:00Z",
  "address": "123 Main St",
  "notes": "Please call before arriving"
}
```

---

### 8.5 Roadside — `/roadside`

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/roadside/` | Bearer | Submit a new roadside request |
| `GET` | `/roadside/my` | Bearer | List current user's roadside requests |
| `GET` | `/roadside/all` | Admin | List all roadside requests |
| `GET` | `/roadside/{id}` | Bearer | Get request detail (owner or admin) |
| `PATCH` | `/roadside/{id}/assign` | Admin | Assign a mechanic to the request |
| `PATCH` | `/roadside/{id}/status` | Bearer | Update status (customers may only set `cancelled`) |
| `WS` | `/roadside/ws/admin` | Bearer (token in URL query param `?token=`) | Admin real-time dispatch stream |
| `WS` | `/roadside/ws/customer/{request_id}` | Bearer | Customer real-time tracking stream |

**POST `/roadside/`** request body:
```json
{
  "location": "Corner of 5th Ave and Main St",
  "issue_type": "flat_tyre",
  "vehicle_id": 3,
  "notes": "Front left tyre"
}
```

---

### 8.6 Mechanics — `/admin/mechanics` (also `/mechanics`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/admin/mechanics/` | Admin | List all mechanics |
| `POST` | `/admin/mechanics/` | Admin | Create a mechanic account |
| `PUT` | `/admin/mechanics/{id}/schedule` | Admin | Replace a mechanic's weekly schedule |
| `POST` | `/admin/mechanics/{id}/time-off` | Admin | Add a time-off block |
| `DELETE` | `/admin/mechanics/{id}/time-off/{time_off_id}` | Admin | Remove a time-off block |
| `GET` | `/admin/mechanics/available-for-booking/{booking_id}` | Admin | List mechanics free for a given booking's time slot |

**POST `/admin/mechanics/`** creates a user with `role=mechanic` and auto-seeds a Mon–Sat 09:00–18:00 schedule.

---

### 8.7 AI Chat — `/api/chat` (also `/chat`)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/chat/` | Optional Bearer | Send message to AI assistant |

Request body:
```json
{
  "message": "What services do you offer?",
  "conversation_history": [
    {"role": "user", "content": "Hi"},
    {"role": "assistant", "content": "Hello! How can I help?"}
  ]
}
```

Response:
```json
{
  "response": "We offer workshop, home, and roadside services...",
  "intent": "GROUNDED_KNOWLEDGE",
  "sources": ["workshop_policies"],
  "booking_id": null
}
```

The `intent` field reveals which AI branch handled the request (see §12).

---

### 8.8 Health Check

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | None | Returns `{"status": "healthy"}` |

---

## 9. Feature Inventory

### F1 — Real-Time Slot Availability Engine

Located in `backend/app/services/availability.py`.

Generates time slots for a given service and date. Each slot is a `duration_minutes` window within business hours (09:00–18:00 UTC, Monday–Saturday). Availability logic differs by service type:

- **Workshop:** Counts concurrent bookings (status in PENDING/CONFIRMED/ASSIGNED/IN_PROGRESS) against a default bay capacity of 3. Uses `pg_advisory_xact_lock` to prevent race conditions.
- **Home:** Checks per-mechanic schedule + time-off + existing booking conflicts (with a 30-min travel buffer before and after each booking).
- **Roadside:** Always `available=True`, `capacity_remaining=999`.

If no slots are available on the requested date, `find_alternative_slots()` searches up to 3 days ahead and returns up to 5 alternatives.

---

### F2 — Mechanic Assignment & Conflict Prevention

Admin can assign an available mechanic to a booking via `PATCH /bookings/{id}/assign`. The endpoint validates that the mechanic is free for the booking's time window using the same availability engine used for slot generation, preventing double-booking.

For **home service bookings**, the system also attempts automatic assignment at booking creation time — if any mechanic is available, the booking is immediately set to `ASSIGNED` instead of `PENDING`.

---

### F3 — Booking Validation

`POST /bookings/` enforces the following rules (in order):

1. **Vehicle ownership** — the vehicle must belong to the authenticated user.
2. **Duplicate prevention** — rejects exact same service + vehicle + scheduled_at combos.
3. **Vehicle conflict** — the same vehicle cannot have two overlapping bookings.
4. **Daily limit** — maximum 5 bookings per customer per day.
5. **Capacity check** — calls the availability engine for the requested slot.
6. **Advisory lock** — acquires `pg_advisory_xact_lock(hashtext(slot_key))` before final insert to handle concurrent submissions.

---

### F4 — Roadside Emergency Dispatch

A lifecycle-tracked SOS flow:

```
requested → accepted → assigned → en_route → arrived → resolved
                                                        ↓
                                                    cancelled (at any point)
```

Admin panel shows live requests via WebSocket (`/roadside/ws/admin`). Admin assigns a mechanic via `PATCH /roadside/{id}/assign`, then progresses status via `PATCH /roadside/{id}/status`. All status changes are broadcast to both the admin WebSocket stream and the customer's tracking WebSocket (`/roadside/ws/customer/{request_id}`). Customer-facing emergency page reconnects automatically every 4 seconds and falls back to 5-second HTTP polling if WebSocket is unavailable.

---

### F5 — AI Chat Assistant (3-Branch Rule-Based)

A conversational assistant embedded in `ChatWidget.tsx`. Intent is classified by keyword matching. See §12 for the complete deep dive.

---

### F6 — Verified Booking Confirmation (ID-Gated)

The AI booking flow ends with a summary presentation. The booking is not executed until the user explicitly types "confirm" or "yes". After successful execution, the response includes the new `booking_id` in the JSON payload, and the UI renders a confirmation card with the booking reference.

---

## 10. Frontend Route Map

| Route | Page File | Auth Required | Purpose |
|---|---|---|---|
| `/` | `app/page.tsx` | None | Public landing page |
| `/login` | `app/login/page.tsx` | None | Customer login (no registration form) |
| `/services` | `app/services/page.tsx` | None | Public service catalog |
| `/emergency` | `app/emergency/page.tsx` | Bearer | Submit SOS + live status tracking |
| `/dashboard` | `app/dashboard/page.tsx` | Bearer | Workshop booking wizard |
| `/dashboard/home-service` | `app/dashboard/home-service/page.tsx` | Bearer | Home service booking form |
| `/dashboard/vehicles` | `app/dashboard/vehicles/page.tsx` | Bearer | Garage (add/delete vehicles) |
| `/dashboard/bookings` | `app/dashboard/bookings/page.tsx` | Bearer | Booking history |
| `/dashboard/bookings/[id]` | `app/dashboard/bookings/[id]/page.tsx` | Bearer | Booking detail + cancel button |
| `/admin/login` | `app/admin/login/page.tsx` | None | Admin login (same backend endpoint) |
| `/admin` | `app/admin/page.tsx` | Admin role | Overview dashboard |
| `/admin/bookings` | `app/admin/bookings/page.tsx` | Admin role | Booking management + assign mechanic |
| `/admin/mechanics` | `app/admin/mechanics/page.tsx` | Admin role | Mechanic CRUD + schedule editor |
| `/admin/services` | `app/admin/services/page.tsx` | Admin role | Service catalog management |
| `/admin/roadside` | `app/admin/roadside/page.tsx` | Admin role | Live roadside dispatch console |

**Auth guards:**
- `app/dashboard/layout.tsx`: reads `localStorage["token"]`, calls `GET /auth/me`, redirects to `/login` if missing or expired.
- `app/admin/layout.tsx`: same as above, additionally checks `role === "admin"`, redirects to `/admin/login` if not.

---

## 11. User Roles & Permissions

| Capability | Customer | Mechanic | Admin |
|---|---|---|---|
| Register (self-service) | ✅ via API | ❌ | ❌ |
| Login | ✅ | ✅ | ✅ |
| View service catalog | ✅ | ✅ | ✅ |
| Add / delete own vehicles | ✅ | ✅ | ✅ |
| Create bookings | ✅ | ✅ | ✅ |
| View own bookings | ✅ | ✅ | ✅ |
| Cancel own bookings | ✅ | ✅ | ✅ |
| Submit roadside request | ✅ | ✅ | ✅ |
| View all bookings | ❌ | ❌ | ✅ |
| Assign mechanic to booking | ❌ | ❌ | ✅ |
| Update booking status | ❌ | ❌ | ✅ |
| View all roadside requests | ❌ | ❌ | ✅ |
| Assign mechanic to roadside | ❌ | ❌ | ✅ |
| Update roadside status | Cancel only | ❌ | ✅ (all statuses) |
| Create services | ❌ | ❌ | ✅ |
| Create mechanic accounts | ❌ | ❌ | ✅ |
| Manage mechanic schedules | ❌ | ❌ | ✅ |
| Access admin WebSocket stream | ❌ | ❌ | ✅ |
| Use AI chat assistant | ✅ (unauthenticated allowed) | ✅ | ✅ |
| Execute booking via AI chat | ✅ (must be authenticated) | ✅ | ✅ |

> **There is no mechanic-specific UI.** Mechanic accounts exist in the database and are used for assignment tracking, but there is no separate mechanic portal or login flow — mechanics interact through admin or the customer-facing app.

---

## 12. AI Assistant Deep Dive

**Files:** `backend/app/services/ai/orchestrator.py`, `rag.py`, `tools.py`, `knowledge/approved_knowledge.py`  
**Entry point:** `POST /api/chat/`

### 12.1 Architecture

The AI assistant is **entirely rule-based**. The `GROQ_API_KEY` is configured in `.env` but no LLM API calls are made at runtime. All responses are generated through keyword classification, TF-scored document retrieval, and deterministic booking execution.

### 12.2 Intent Classification

The orchestrator classifies user messages by keyword matching against the last user message (and partial history). Classification is sequential; first match wins:

| Intent Branch | Trigger Keywords (examples) | Handler |
|---|---|---|
| `BOOKING_CONFIRMATION` | "confirm", "yes", "proceed", "book it" | `execute_confirmed_booking_core()` |
| `BOOKING_FLOW` | "book", "schedule", "appointment", "reserve" | Conversational booking state machine |
| `LIVE_PRICING` | "price", "cost", "how much", "rate", "fee" | `get_live_services_tool()` |
| `LIVE_AVAILABILITY` | "available", "slot", "time", "when", "free" | `check_live_availability_tool()` |
| `GROUNDED_KNOWLEDGE` | *(default — all other messages)* | `GroundedRAGRetriever` |

### 12.3 Booking Flow State Machine

The AI booking flow is a single-session, in-memory multi-turn conversation:

```
1. Auth check         → if no user, return "please login" prompt
2. Garage check       → load user's vehicles; if none, return "add a vehicle" prompt
3. Service match      → fuzzy-match user request to active services by type
4. Vehicle match      → ask user to choose vehicle if >1
5. Slot candidate     → propose next available slot ≥ now + 3 hours
6. Summary            → present booking details (service, vehicle, time, price)
7. Await confirmation → wait for "confirm"/"yes" message (BOOKING_CONFIRMATION intent)
8. Execute            → call execute_confirmed_booking_core() with advisory lock
9. Return             → booking_id in response payload
```

Partial state is passed back and forth as a JSON object embedded in the `conversation_history` field. There is no server-side session storage.

### 12.4 RAG (Grounded Knowledge Retrieval)

**Class:** `GroundedRAGRetriever` in `rag.py`

- **Source:** `knowledge/approved_knowledge.py` — a Python file containing a list `APPROVED_DOCUMENTS`, each a dict with `id`, `title`, `content` (long strings).
- **5 documents:**
  1. `workshop_policies` — hours, address, bay capacity, lead time
  2. `home_service_policies` — coverage radius, eligible services, travel buffer
  3. `roadside_assistance` — 24/7, response time, pricing (USD), tracking ID format, phone number
  4. `booking_rules` — auth requirement, ownership, daily limit, confirmation requirement
  5. `cancellation_warranty` — zero-penalty cancellation, 12-month/15,000km warranty
- **Retrieval algorithm:** Term Frequency (TF) scoring — tokenise query, count term occurrences in each document, rank by score. No embeddings, no vector database.
- **Response generation:** Top-matching document content is inserted into a template response. No LLM generation.

### 12.5 Live Tool Functions (`tools.py`)

| Function | What it does |
|---|---|
| `get_live_services_tool(db, service_type)` | Queries `services` table for active services, formats as pricing list |
| `check_live_availability_tool(db, service_id, date_str)` | Calls availability engine for the given date, returns formatted slot list |

### 12.6 Chat Widget (Frontend)

`ChatWidget.tsx` — floating button, bottom-right of all non-admin pages.

- Maintains local `messages` state (array of `{role, content}`)
- Sends last 6 messages as `conversation_history` to `POST /api/chat/`
- Renders branch indicator tags in the response:
  - 📘 `Grounded RAG` — knowledge base answer
  - ⚡ `Live Backend Tool` — real-time DB data
  - 🛡️ `Core Booking Flow` — booking execution
- Passes JWT token if present in `localStorage["token"]`

---

## 13. Availability Engine Deep Dive

**File:** `backend/app/services/availability.py`

### Business Rules

| Rule | Value |
|---|---|
| Business hours (UTC) | 09:00 – 18:00 |
| Working days | Monday – Saturday (Sunday excluded) |
| Default workshop capacity | 3 concurrent bays |
| Minimum lead time | 2 hours before slot start |
| Home service travel buffer | 30 minutes before + 30 minutes after each booking |
| Default slot duration | `service.duration_minutes` (typically 60 min) |

### Workshop Capacity Logic

```python
# Pseudo-code for workshop slot availability
active_statuses = [PENDING, CONFIRMED, ASSIGNED, IN_PROGRESS]
overlapping = SELECT COUNT(*) FROM bookings
              WHERE service_type = 'workshop'
              AND status IN active_statuses
              AND scheduled_at < slot_end
              AND scheduled_at + duration > slot_start

capacity_remaining = DEFAULT_CAPACITY - overlapping
available = capacity_remaining > 0
```

There is a PostgreSQL-specific path using SQL interval arithmetic and a Python-side fallback for SQLite (used in testing).

### Home Service Capacity Logic

```python
# For each slot, for each active mechanic:
# 1. Is the mechanic scheduled this day of week? (mechanic_schedules)
# 2. Is the mechanic not on time-off? (mechanic_time_offs)
# 3. Does the mechanic have no conflicting booking?
#    (conflict = other booking overlaps slot ± 30min travel buffer)
# → available_mechanics = count of mechanics passing all 3 checks
```

### Race Condition Prevention

Before creating a booking, the endpoint calls:
```sql
SELECT pg_advisory_xact_lock(hashtext(:slot_key))
```
where `slot_key` is a string like `"service_1_2026-11-25T10:00:00"`. This serialises concurrent booking creation for the same slot within the transaction, preventing overselling.

### Alternative Slot Search

If a requested slot is unavailable, `find_alternative_slots(service_id, requested_dt, db)`:
1. Starts from `requested_dt`
2. Iterates forward up to 3 calendar days
3. Collects available slots (skipping Sundays and outside-hours slots)
4. Returns up to 5 found slots

---

## 14. WebSocket Architecture

### Admin Stream — `/roadside/ws/admin`

- **Auth:** Token passed as query parameter `?token=<jwt>` (not in header — WebSocket limitation)
- **Behaviour:** On connect, the admin receives the full current list of open/active roadside requests as a JSON snapshot. Subsequently, any status change to any roadside request (via PATCH endpoints or dispatch service) broadcasts the updated request to all connected admin WebSocket clients.
- **Implementation:** In-memory list `admin_connections` in `roadside_dispatch.py`. No message broker or Redis — only works within a single process.

### Customer Tracking — `/roadside/ws/customer/{request_id}`

- **Auth:** Token in `?token=<jwt>` query parameter
- **Behaviour:** Customer receives status updates for their specific request in real-time. Only updates for `request_id` matching their connection are delivered.

### Frontend Reconnect Strategy

Both admin and customer WebSocket clients implement:
- **Auto-reconnect:** 4-second delay before attempting reconnect on close/error
- **HTTP polling fallback:** Begins polling the REST endpoint every 5 seconds (admin: 10 seconds) if WebSocket connection fails or is not supported
- **State:** Reconnect interval stored in React `useRef` to avoid re-render loops

> [!IMPORTANT]
> The WebSocket admin connection list is **in-memory only**. If the FastAPI process restarts, all connected clients are disconnected and no messages are queued. For production, replace with Redis Pub/Sub or a message broker.

---

## 15. Email Notifications

**File:** `backend/app/utils/email.py`

### When Emails Are Sent

Currently, an email is sent **only when a booking status changes to `confirmed`**. This is triggered in `PATCH /bookings/{id}/status` when the admin updates status to `confirmed`.

### Configuration

Requires all four SMTP env vars (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`). If any are absent or blank, the function falls back to printing the email body to the console (stdout) — no exception is raised.

### Email Content

The confirmation email contains:
- Booking ID
- Service name
- Scheduled date/time
- Customer name

### Extending Notifications

To add notifications for other status transitions (e.g., `assigned`, `completed`), add `await send_booking_confirmation_email(...)` calls at the appropriate points in `bookings.py` or `roadside_dispatch.py`.

---

## 16. Known Issues & Technical Debt

This section documents every identified issue. All items should be triaged before production deployment.

### 🔴 Critical (Security)

| ID | Issue | Location | Impact |
|---|---|---|---|
| SEC-1 | `SECRET_KEY` is a placeholder string | `backend/.env` | All JWTs can be forged by anyone who reads the file |
| SEC-2 | `GROQ_API_KEY` is a live key committed to `.env` | `backend/.env` | Key is exposed in version history; rotate immediately |
| SEC-3 | No rate limiting on auth endpoints | `api/endpoints/auth.py` | Brute-force password attacks are unrestricted |

### 🟠 High (Stability / Correctness)

| ID | Issue | Location | Impact |
|---|---|---|---|
| STB-1 | No database migrations (Alembic unused) | `app/main.py` | Adding/altering columns requires manual SQL or table drop; no rollback capability |
| STB-2 | `en route` vs `en_route` status inconsistency | `models/roadside.py`, `roadside_dispatch.py` | Dual-value checks everywhere; will break if any check is missed |
| STB-3 | WebSocket connections are in-memory only | `services/roadside_dispatch.py` | Multi-process deployment will drop messages; no message persistence |
| STB-4 | `create_all` does not apply schema changes to existing tables | `app/main.py` | Existing deployments will not receive new columns without manual migration |

### 🟡 Medium (Maintainability / Developer Experience)

| ID | Issue | Location | Impact |
|---|---|---|---|
| MNT-1 | No test suite (zero test files) | Entire project | No regression safety net; refactoring is high-risk |
| MNT-2 | No Docker / docker-compose | Project root | Onboarding requires manual environment setup; deployment is manual |
| MNT-3 | No CI/CD configuration | Project root | No automated checks on pull requests |
| MNT-4 | No `.env.example` file | Project root | New developers must guess required variables |
| MNT-5 | CORS origin hardcoded in `main.py` | `app/main.py` | Must edit source code to change allowed origin |
| MNT-6 | Frontend API base URL hardcoded as `http://localhost:8000` | All frontend pages | Must edit every page file to point at a different backend |
| MNT-7 | Mechanic schedule time stored as "HH:MM" string | `models/mechanic.py` | Inconsistent with `MechanicTimeOff` datetime; parsing is fragile |

### 🔵 Low (UX / Minor Bugs)

| ID | Issue | Location | Impact |
|---|---|---|---|
| UX-1 | `VehicleForm.tsx` exists but is never imported | `components/VehicleForm.tsx` | Dead code; dashboard pages use inline vehicle forms instead |
| UX-2 | No customer registration UI | `app/login/page.tsx` | "Register here" text is present but no link or form exists |
| UX-3 | Currency inconsistency: AI/backend uses `$`, services UI shows `PKR` | `services/page.tsx`, `knowledge/approved_knowledge.py` | Confusing for users |
| UX-4 | No frontend error boundaries | All dashboard pages | Uncaught React errors crash the entire page tree |
| UX-5 | Admin role cannot be self-registered | `api/endpoints/auth.py` | Admin accounts must be created by directly editing the database |
| UX-6 | No registration link on login page | `app/login/page.tsx` | New customers cannot register through the UI |

---

## 17. Operational Runbook

### Creating the First Admin User

There is no admin registration endpoint. Follow these steps:

**Step 1 — Register a normal customer account via API:**
```bash
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"full_name": "Admin User", "email": "admin@carassistance.com", "password": "StrongPass123!", "phone": "+10000000000"}'
```

**Step 2 — Promote the account to admin directly in the database:**
```sql
UPDATE users
SET role = 'admin'
WHERE email = 'admin@carassistance.com';
```

**Step 3 — Login via the admin login page at `/admin/login`** using the same email and password.

---

### Adding Services

Services can only be created by an admin. Two methods:

**Via admin UI:** Navigate to `http://localhost:3000/admin/services` and use the create form.

**Via API (with admin JWT):**
```bash
curl -X POST http://localhost:8000/services/ \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Full Service",
    "description": "Complete vehicle inspection and service",
    "service_type": "workshop",
    "base_price": 149.99,
    "duration_minutes": 120
  }'
```

---

### Creating a Mechanic Account

Mechanic accounts can only be created by an admin.

**Via admin UI:** Navigate to `http://localhost:3000/admin/mechanics`.

**Via API:**
```bash
curl -X POST http://localhost:8000/admin/mechanics/ \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "full_name": "John Wrench",
    "email": "john@carassistance.com",
    "password": "MechanicPass123!",
    "phone": "+10000000001"
  }'
```

A Mon–Sat 09:00–18:00 schedule is automatically created for the new mechanic.

---

### Resetting the Database

Since all tables are managed by `create_all`, the safest reset procedure is:

```sql
-- Connect to the database and drop all tables (order matters due to FKs)
DROP TABLE IF EXISTS roadside_assignments CASCADE;
DROP TABLE IF EXISTS roadside_requests CASCADE;
DROP TABLE IF EXISTS mechanic_time_offs CASCADE;
DROP TABLE IF EXISTS mechanic_schedules CASCADE;
DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS services CASCADE;
DROP TABLE IF EXISTS vehicles CASCADE;
DROP TABLE IF EXISTS users CASCADE;
```

Then restart the backend — `create_all` will recreate all tables.

---

### Checking Logs

The backend logs to stdout. Run with:
```powershell
uvicorn app.main:app --reload --port 8000 --log-level debug
```

There is no structured logging, log rotation, or log file output configured.

---

## 18. Development Notes

### All Timestamps Are UTC

The backend uses `datetime.utcnow()` throughout. Slots are generated in UTC. The frontend displays raw UTC timestamps without timezone conversion — users in non-UTC timezones will see UTC times. Implement timezone conversion in the frontend before go-live for a non-UTC audience.

### No Hot Reload for Model Changes

`uvicorn --reload` watches Python files and reloads on save, but `create_all` only creates tables that do **not** exist. If you add a column to a model:

1. Stop the backend.
2. Apply the column change manually in SQL (`ALTER TABLE … ADD COLUMN …`).
3. Restart the backend.

Or drop and recreate the table if data loss is acceptable.

### Starting Alembic Migrations (Recommended Next Step)

The project has Alembic installed. To initialise proper migrations:

```powershell
cd e:\CarAssistance\backend
alembic init alembic
# Edit alembic/env.py to point at your async database URL and import Base
alembic revision --autogenerate -m "initial schema"
alembic upgrade head
```

Then remove the `create_all` call from `app/main.py` startup.

### Frontend API Base URL

Every frontend page contains a hardcoded `fetch("http://localhost:8000/...")` call. To target a different backend, extract the base URL to a shared constant (e.g., `src/lib/api.ts`) and import it everywhere:

```typescript
// src/lib/api.ts
export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
```

### No Registration UI

The `/login` page has a "Register here" text element but no functional link or form. To add registration:

1. Create `src/app/register/page.tsx` with a form.
2. Submit to `POST /auth/register`.
3. On success, redirect to `/login`.

---

*End of Handoff Document*  
*All information is accurate as of the date of preparation. The codebase was read in full before this document was produced.*
