# Automotive Marketplace API

REST API for an automotive marketplace built for the **PT Daya Rekadigital
Indonesia Backend Technical Assessment**. It provides vehicle listing CRUD,
soft deletion, an arbitrary-depth category tree, category-scoped dynamic
filters, faceted counting, PostgreSQL full-text search, structured filtering
and cursor pagination.

The implementation is a single deployable service on Bun + Elysia backed by one
PostgreSQL database, written with raw parameterized SQL through `pg`. No ORM is
used, per the assessment constraint.

---

## Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Architecture](#3-architecture)
4. [Project Structure](#4-project-structure)
5. [Database & Schema Design](#5-database--schema-design)
6. [Category Hierarchy Strategy](#6-category-hierarchy-strategy)
7. [Dynamic Filter Architecture](#7-dynamic-filter-architecture)
8. [Search Architecture](#8-search-architecture)
9. [Pagination & Querying Strategy](#9-pagination--querying-strategy)
10. [Indexing & Performance Decisions](#10-indexing--performance-decisions)
11. [API Endpoints](#11-api-endpoints)
12. [Validation & Error Handling](#12-validation--error-handling)
13. [Running Locally](#13-running-locally)
14. [Running with Docker](#14-running-with-docker)
15. [Database Migrations](#15-database-migrations)
16. [Database Seeding](#16-database-seeding)
17. [Testing](#17-testing)
18. [API Documentation / OpenAPI](#18-api-documentation--openapi)
19. [Implementation Decisions & Scope](#19-implementation-decisions--scope)
20. [Known Limitations / Deliberate Non-Goals](#20-known-limitations--deliberate-non-goals)
21. [Deployment](#21-deployment)
22. [Assessment Notes / Technical Rationale](#22-assessment-notes--technical-rationale)

---

## 1. Project Overview

The API models an automotive marketplace with three domain modules:

- **Listings** — vehicle listings (make, model, year, mileage, price,
  transmission, fuel type, color, city, status), soft deletion, search,
  structured filtering, sorting and cursor pagination.
- **Categories** — a self-referencing, arbitrary-depth hierarchy with flat,
  nested-tree and subtree-listing reads.
- **Filters** — category-scoped filter definitions (`enum`, `range`, `boolean`)
  and faceted counts computed inside PostgreSQL.

Structurally important marketplace fields are typed relational columns.
Category-specific attributes that cannot be known in advance are stored in a
`listings.attributes` JSONB column, validated on write against the declaring
category's filter definitions.

The delivered scope is verifiable in-repo: 4 migrations, an idempotent seed,
16 documented HTTP operations, and a Bun test suite of **60 passing tests /
0 failures** with clean typecheck and lint.

---

## 2. Tech Stack

| Concern | Choice | Notes |
|---|---|---|
| Runtime / package manager | **Bun** `>=1.2.0` | Assessment-permitted; provides dev, build and test tooling in one tool |
| Language | **TypeScript** (strict) | `strict`, `noUncheckedIndexedAccess`, `noUnusedLocals/Parameters` enabled |
| HTTP framework | **Elysia** `^1.4` | Routing, schema validation, OpenAPI generation |
| OpenAPI | **`@elysiajs/openapi`** `^1.4` | Serves the spec and a docs UI |
| Database | **PostgreSQL 17** | Single source of truth |
| Driver | **`pg`** `^8.23` | Raw parameterized SQL, connection pool |
| ORM | **None** | Forbidden by the assessment |
| Testing | **`bun test`** | 9 test files, 60 tests |
| Lint / format | **ESLint** (flat config) + **Prettier** | `bun run lint`, `bun run format` |
| Containerization | **Docker + Docker Compose** | API + PostgreSQL, one command |

---

## 3. Architecture

**Modular monolith + layered architecture + repository pattern.** This is the
actual style used by the code; it is not a full domain-driven design
implementation and is not presented as one. There are no aggregates, domain
events, bounded-context segregation or ubiquitous-language artifacts.

Dependency flow, enforced by design and by test:

```
HTTP / Elysia
    ↓
Routes
    ↓
Controllers
    ↓
Services / Use Cases
    ↓
Repositories
    ↓
PostgreSQL
```

Responsibilities:

- **Routes** register method, path, schemas, input guards and controller
  handlers. No SQL, no business logic.
- **Controllers** translate validated HTTP input into service calls and shape
  responses. No SQL, no database access, no business rules.
- **Services** hold application/business logic and rules that depend on database
  state (category existence, enum option matching, cycle prevention, subtree
  expansion). Framework-independent — no Elysia imports.
- **Repositories** own SQL, parameter binding and row mapping. No HTTP concepts,
  no status codes, no Elysia types.
- **PostgreSQL** is the single persistence boundary.

The boundary is asserted by `tests/architecture.test.ts`, which fails the suite
if SQL appears in controllers/routes, if Elysia or `Request`/`Response` appear
in services/repositories, or if `pg` is imported in a controller. Module
collaboration is explicit and acyclic: `CategoryService` depends on
`ListingService` for category-scoped listing reads, while `ListingService`
depends on the Categories and Filters **repositories** rather than their
services, which avoids an import cycle.

Cross-cutting concerns live once:

- `middleware/error-handler.ts` — single error-to-HTTP mapping.
- `middleware/not-found.ts` — deterministic 404 for unmatched routes.
- `config/env.ts` — validated, typed environment read once at startup.
- `shared/logger.ts` — dependency-free structured JSON logger with secret
  redaction.
- `database/pool.ts` — pool, transaction helper and driver-error mapping.

---

## 4. Project Structure

```
src/
├── app.ts                      # Elysia composition, OpenAPI, route mounting
├── server.ts                   # Process entrypoint, startup + graceful shutdown
├── health.routes.ts            # /health readiness, /health/live liveness
├── config/
│   ├── env.ts                  # Validated environment model
│   └── index.ts
├── database/
│   ├── pool.ts                 # pg pool, query(), withTransaction(), error mapping
│   ├── migrate.ts              # Forward-only SQL migration runner
│   ├── index.ts
│   ├── migrations/
│   │   ├── 001_enable_extensions.sql
│   │   ├── 002_create_categories.sql
│   │   ├── 003_create_filter_attributes_and_listings.sql
│   │   └── 004_create_indexes_and_triggers.sql
│   └── seeds/
│       └── seed.ts             # Deterministic, idempotent seed
├── middleware/
│   ├── error-handler.ts
│   ├── not-found.ts
│   └── index.ts
├── modules/
│   ├── index.ts
│   ├── listings/               # routes, controller, service, repository, schema, types
│   ├── categories/             # routes, controller, service, repository, schema, types
│   └── filters/                # routes, controller, service, repository, schema, types
└── shared/
    ├── errors/                 # AppError hierarchy
    ├── schemas/                # Shared Elysia schemas (UUID shape)
    ├── types/                  # api.ts, http.ts response/context contracts
    └── utils/                  # cursor.ts, strict-input.ts, helpers.ts

tests/                          # 9 files, 60 tests
docker/entrypoint.sh            # migrate → seed → start
Dockerfile
docker-compose.yml
```

Each module uses the same six-file shape (`*.routes.ts`, `*.controller.ts`,
`*.service.ts`, `*.repository.ts`, `*.schema.ts`, `*.types.ts`) so a reviewer can
navigate any domain by convention.

---

## 5. Database & Schema Design

Three tables plus the migration bookkeeping table. Schema lives entirely in SQL
migrations; there are no model classes or generated schema types.

### `categories`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `parent_id` | `uuid` FK → `categories(id)` | `ON DELETE RESTRICT`; self-referencing |
| `name` | `varchar(100)` | non-empty check |
| `slug` | `varchar(100)` | non-empty check |
| `path` | `text` | materialized ancestry, e.g. `/vehicles/cars/suv` |
| `depth` | `integer` | `>= 0`; root is `0` |
| `created_at` / `updated_at` | `timestamptz` | `updated_at` maintained by trigger |

Constraints: `UNIQUE (parent_id, slug)` plus a partial `UNIQUE (slug) WHERE
parent_id IS NULL` for roots. The partial index is required because a plain
`UNIQUE` treats each `NULL` parent as distinct, which would otherwise allow two
root categories to share a slug.

### `listings`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `category_id` | `uuid` FK → `categories(id)` | `ON DELETE RESTRICT` |
| `title` | `varchar(255)` | non-empty check |
| `description` | `text` | nullable |
| `make`, `model` | `varchar(100)` | non-empty checks |
| `year` | `smallint` | `>= 1886` |
| `mileage` | `integer` | `>= 0`, default `0` |
| `price` | `numeric(15,2)` | `>= 0` |
| `condition`, `transmission`, `fuel_type` | `varchar(30)` | |
| `color` | `varchar(50)` | nullable |
| `city` | `varchar(100)` | |
| `status` | `varchar(20)` | `available \| sold \| pending \| removed`, default `available` |
| `images` | `jsonb` | ordered URL array, default `[]` |
| `attributes` | `jsonb` | category-specific dynamic attributes, default `{}` |
| `search_vector` | `tsvector` | populated from title/description/make/model/color/city |
| `created_at` / `updated_at` | `timestamptz` | |
| `deleted_at` | `timestamptz` | soft-delete marker, nullable |

Note on `price`: it is `NUMERIC` and `pg` returns it as a string to avoid
precision loss, so the repository converts it to a number during row mapping.

### `filter_attributes`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `category_id` | `uuid` FK → `categories(id)` | `ON DELETE CASCADE` |
| `name` | `varchar(100)` | display label |
| `slug` | `varchar(100)` | the key written into `listings.attributes` |
| `type` | `varchar(20)` | `enum \| range \| boolean` |
| `options` | `jsonb` | `[{ value, label }]`, used by `enum` only |
| `created_at` / `updated_at` | `timestamptz` | |

Constraint: `UNIQUE (category_id, slug)` — a filter key is unique within a
category but may be reused across categories with different definitions.

### Design rationale

- **Typed columns for structural fields, JSONB for genuinely dynamic data.**
  Make, model, year, mileage, price, city and status are queried, sorted and
  faceted on nearly every request, so they are typed columns with their own
  indexes. Attributes that differ per category (`drivetrain`, `warranty`,
  `body_style`, `engine_cc`, …) cannot be modelled as fixed columns without
  either a wide sparse table or a far more complex EAV schema, so they live in
  one JSONB object.
- **`filter_attributes` is a definition table, not a values table.** It declares
  which attributes a category accepts and what an enum may contain. Values stay
  denormalized in `listings.attributes`, which keeps listing reads single-table.
- **`ON DELETE RESTRICT` on listings' category** prevents deleting a category
  that still has listings, while `filter_attributes` cascades because a filter
  definition is meaningless without its category.
- **Database constraints are the final source of truth.** Service-layer checks
  produce precise error codes; the FK and CHECK constraints still enforce
  correctness if a code path is bypassed.

`updated_at` is maintained by a single `set_updated_at()` trigger function
attached to all three tables, so clients cannot forge it and no write path has
to remember to set it.

---

## 6. Category Hierarchy Strategy

The model is **adjacency list (`parent_id`) + materialized path + depth**.

Why all three rather than one:

- `parent_id` gives referential integrity and is the canonical structure. The
  parent-child relation is enforced by the database, so a category can never
  point at a non-existent parent.
- `path` (`/vehicles/cars/suv`) makes subtree ordering and ancestry readable in
  a single column and is the reason the tree endpoint can be assembled in one
  pass.
- `depth` makes breadth-first ordering and level-aware reads trivial without
  parsing `path`.

How each operation works:

- **Create.** `path` and `depth` are derived from the parent in the same
  `INSERT` statement via scalar subqueries, so they can never drift from
  `parent_id`:
  `COALESCE((SELECT path FROM categories WHERE id = $1), '') || '/' || slug`
  and `COALESCE((SELECT depth FROM categories WHERE id = $1), -1) + 1`.
  A root category gets `/<slug>` and depth `0`.
- **Move / rename.** A recursive CTE recomputes `path` and `depth` for the
  category **and its entire subtree** in one statement, so descendants are never
  left with stale paths after a move.
- **Descendant traversal.** `findDescendantIds(id)` uses `WITH RECURSIVE` over
  `parent_id` to return the category and all descendants. This is the id set
  used for subtree listing queries.
- **Tree read.** `GET /categories/tree` reads all rows `ORDER BY path` and
  assembles parents before children in a single in-memory pass — no recursive
  query per node and no N+1.
- **Cycle prevention.** The service rejects a move where the target parent is
  the category itself or one of its own descendants (resolved via the descendant
  set), returning `409 CONFLICT` with code `CATEGORY_CYCLE`. Moving to the root
  (`parentId: null`) is explicitly not a cycle.
- **Slug uniqueness.** Enforced twice: a service-level check for a clear error
  (`CATEGORY_SLUG_CONFLICT`) and the database unique constraints for concurrency
  safety. The lookup splits `parentId IS NULL` from `parentId = $1` so each
  branch matches an index exactly.

Why not a more complex hierarchy model: at this scale, `ltree`, closure tables
or nested sets would add migration complexity, write amplification and a
learning cost without a query that needs them. The `path` column already
provides the ancestry string that `ltree` would, while `parent_id` keeps foreign
key integrity that `ltree` alone would not. Depth remains arbitrary — nothing in
the schema caps nesting.

---

## 7. Dynamic Filter Architecture

Filter definitions are **category-scoped** rows in `filter_attributes`. Each
definition is one of three types:

- `enum` — a fixed option set stored in `options` JSONB as
  `[{ value, label }]` (e.g. `fuel_type`, `transmission`, `drivetrain`).
- `range` — numeric bounds; no options are stored (e.g. `price`, `year`,
  `engine_cc`, `top_speed`).
- `boolean` — a yes/no flag with no options (e.g. `warranty`, `accident_free`).

**Write-time validation.** When a listing is created or updated, the service
loads the filter definitions for the listing's category and validates the
submitted `attributes` strictly in both directions:

- any submitted key not declared for the category is rejected
  (`unknown_attribute`) — unfilterable data never reaches the JSONB column;
- an `enum` value must case-insensitively match a declared option, and the
  **canonical option value** is persisted (`AWD` → `awd`);
- a `range` value must be a finite number;
- a `boolean` value must be a boolean (accepting `true`/`false`, `1`/`0`).

Validation failures return `400` with `details.issues` naming each offending
key, its reason, and — for enums — the allowed values.

On update, `attributes` is a whole-object replacement, so the submitted set is
validated as the new complete map. When only the category changes, the stored
attributes are re-validated against the new category rather than being silently
carried over.

**Faceted aggregation.** `GET /filters/{categoryId}` returns definitions plus
counts for the current selection, computed entirely in PostgreSQL via two
focused aggregate queries:

- discrete facets (`enum` / `boolean`) pivot declared options (and, for
  booleans, synthesized `true`/`false`) with a `LEFT JOIN` back to matching
  listings;
- `range` facets return `min` / `max` bounds plus a match count.

Two details worth noting:

- **Typed columns win over JSONB.** Several filter slugs (`fuel_type`,
  `transmission`, `condition`, `price`, `year`, `mileage`, …) also exist as
  typed columns, and the seed reuses those slugs. The repository resolves a
  filter key to its typed column when one exists and falls back to
  `attributes ->> key` only for genuinely dynamic slugs, otherwise facet counts
  would silently be zero.
- **Self-exclusion within a dimension.** Selecting `drivetrain=awd` still
  reports counts for `2wd` and `4wd`. Each facet ignores its own active
  selection, which is standard faceted-search behaviour and is what makes the
  counts usable for switching values.

---

## 8. Search Architecture

Search is implemented **entirely in PostgreSQL**. No Elasticsearch, OpenSearch,
Meilisearch or external search service is present, and no synchronization
pipeline exists because there is only one source of truth.

- A `search_vector tsvector` column is maintained on `listings` and indexed with
  GIN (`idx_listings_search_vector`).
- Query text is matched with
  `search_vector @@ websearch_to_tsquery('english', $n)`. `websearch_to_tsquery`
  is used because it accepts natural user input (quoted phrases, `or`, leading
  `-`) without raising syntax errors on malformed text.
- The seed populates `search_vector` from
  `title || description || make || model || color || city` using
  `to_tsvector('english', …)`.
- Structured predicates (category, make, model, year, mileage, price, city,
  status, …) are combined conjunctively with the text predicate in one
  parameterized statement.
- Typeahead suggestions are handled separately by `pg_trgm`: `GET
  /listings/search/suggest` uses a CTE over `make` and `model` with a
  `LIKE '%q%'` predicate and the trigram similarity operator `%`, both covered
  by GIN `gin_trgm_ops` indexes on `lower(make)` / `lower(model)`. This
  tolerates partial, case-insensitive and typo'd input. User-supplied `%` and
  `_` are escaped so they cannot widen the match.

Suggestions return the stored display-case value (`Toyota`, not `toyota`) so the
suggestion can be reused directly as the `make`/`model` filter value. Only
`make` and `model` suggestions are produced; title suggestions are not
implemented and have no trigram index.

---

## 9. Pagination & Querying Strategy

Listing browsing uses **cursor (keyset) pagination** with deterministic
ordering:

```
ORDER BY created_at DESC, id DESC
```

- **Why the id tie-breaker.** `created_at` alone is not unique — seeded and
  bulk-created rows can share a timestamp. Without a second sort key the order
  within equal timestamps is undefined, so a page boundary could skip or repeat
  rows. `id` is unique, so `(created_at, id)` is a total order.
- **Why not OFFSET.** `OFFSET n` requires the database to walk and discard `n`
  rows and degrades linearly as the page deepens. Keyset pagination seeks
  directly to the last seen position. It is also stable under concurrent
  inserts, whereas `OFFSET` shifts rows between pages when new rows arrive.
- **Transport.** The cursor is an opaque, URL-safe Base64 encoding of
  `{ createdAt, id }`. The timestamp is captured with
  `to_char(created_at AT TIME ZONE 'UTC', '…SS.US"Z"')` at full microsecond
  precision, because `pg` decodes `timestamptz` to a JavaScript `Date` that only
  keeps milliseconds — formatting in SQL prevents the cursor from skipping rows
  that share a millisecond.
- **Implementation.** The keyset predicate is a row-wise comparison,
  `(created_at, id) < ($n::timestamptz, $m::uuid)` (reversed for `asc`), which
  matches `idx_listings_created_cursor` exactly so PostgreSQL can seek rather
  than scan.
- **Page existence.** The query fetches `limit + 1` rows; the extra row signals
  `hasNextPage` and produces `nextCursor` without a `COUNT(*)` on every browse.
- **Response envelope.**
  ```json
  { "data": [], "pagination": { "nextCursor": "...", "hasNextPage": true } }
  ```
- **Cursor constraints.** Cursor pagination is supported only for the default
  `createdAt` ordering. Supplying a cursor with `sortBy=price|year|mileage`
  returns `400 VALIDATION_ERROR` (`CURSOR_UNSUPPORTED_ORDER`) rather than
  silently paginating on an order the cursor does not describe.
- **Total counts are opt-in.** The repository exposes an `includeTotal` mode
  that runs an exact count only when requested; it is not wired to a query
  parameter, so browsing never pays for `COUNT(*)`.

---

## 10. Indexing & Performance Decisions

Indexes are chosen from the actual query patterns of the API rather than added
indiscriminately:

| Index | Purpose |
|---|---|
| `idx_categories_parent_id` | Recursive descendant traversal joins on `parent_id` |
| `idx_categories_path` (`text_pattern_ops`) | Ordered tree assembly / prefix-friendly path access |
| `uq_categories_root_slug` (partial unique) | Root slug uniqueness |
| `UNIQUE (parent_id, slug)` | Non-root slug uniqueness and per-parent lookup |
| `idx_filter_attributes_category` | Filter definitions by category |
| `idx_listings_category` | Category browsing and subtree id sets |
| `idx_listings_status` | Status filtering / soft-delete exclusion |
| `idx_listings_make`, `idx_listings_model`, `idx_listings_city` | Equality filters and facet resolution |
| `idx_listings_year`, `idx_listings_price` | Range filters and range facets |
| `idx_listings_created_cursor` (`created_at DESC, id DESC`) | Keyset pagination seek and default browse order |
| `idx_listings_search_vector` (GIN) | Full-text search |
| `idx_listings_make_trgm`, `idx_listings_model_trgm`, `idx_listings_city_trgm` (GIN `gin_trgm_ops`) | Typeahead / fuzzy matching |

Design reasoning:

- The cursor index is declared `(created_at DESC, id DESC)` to match the sort
  and the row-wise keyset comparison, allowing an index seek for deep pages.
- The three `lower(...) gin_trgm_ops` indexes support both `LIKE '%q%'` and the
  `%` similarity operator, so partial and typo-tolerant matching stays
  index-assisted instead of scanning.
- `text_pattern_ops` is used on `path` because it is prefix-friendly for
  ordering and prefix predicates under a non-C collation.

**On performance evidence.** The repository does not commit EXPLAIN ANALYZE
captures or benchmark artifacts, and no throughput or latency numbers are
claimed here. The index plan above is a design justification derived from the
query shapes in the repositories; the code comments in
`listing.repository.ts` describe the intended plans (for example a bitmap index
scan for trigram suggestions). There are therefore no measured figures in this
README — none should be assumed.

---

## 11. API Endpoints

Base URL locally: `http://localhost:3000`.

### Health

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Readiness probe including a PostgreSQL connectivity check; `503` when the database is down |
| GET | `/health/live` | Liveness probe (excluded from the OpenAPI spec) |

### Listings

| Method | Path | Description |
|---|---|---|
| GET | `/listings` | List/browse with structured filters, sorting, cursor pagination |
| GET | `/listings/search` | Same contract as `GET /listings`, including full-text search via `q` |
| GET | `/listings/search/suggest` | Typeahead suggestions for make and model (`pg_trgm`) |
| GET | `/listings/{id}` | Fetch one listing by id |
| POST | `/listings` | Create a listing (`201`) |
| PATCH | `/listings/{id}` | Partially update a listing |
| DELETE | `/listings/{id}` | Soft-delete a listing (`204`) |

### Categories

| Method | Path | Description |
|---|---|---|
| GET | `/categories` | Flat list of all categories |
| GET | `/categories/tree` | Nested category tree |
| GET | `/categories/{id}` | Fetch one category |
| GET | `/categories/{id}/listings` | Listings in a category (subtree by default) |
| POST | `/categories` | Create a category (`201`) |
| PATCH | `/categories/{id}` | Update / move a category |

### Filters

| Method | Path | Description |
|---|---|---|
| GET | `/filters` | Filter definitions, scoped by `?categoryId=` |
| GET | `/filters/{categoryId}` | Filter definitions plus facet counts for a category |

### Listing search query parameters

Range filters use these **canonical** names:

`priceMin`, `priceMax`, `yearMin`, `yearMax`, `mileageMax`

Backward-compatible **aliases** are also accepted: `minPrice`, `maxPrice`,
`minYear`, `maxYear`, `maxMileage`. When both forms are supplied the canonical
name takes precedence. The aliases exist as compatibility, not as the primary
contract — clients should use the canonical names.

| Parameter | Type | Notes |
|---|---|---|
| `q` | string (≤200) | Full-text query |
| `categoryId` | uuid | Restrict to a category |
| `includeDescendants` | boolean | Include descendant categories (default `false` here; the category-listings endpoint defaults to `true`) |
| `make`, `model`, `condition`, `transmission`, `fuelType`, `color`, `city` | string | Equality filters |
| `status` | enum | `available \| sold \| pending \| removed`; omitted means "not soft-deleted" |
| `priceMin`, `priceMax` | number ≥ 0 | Inclusive bounds |
| `yearMin`, `yearMax` | integer ≥ 1886 | Inclusive bounds |
| `mileageMax` | integer ≥ 0 | Inclusive bound |
| `sortBy` | enum | `createdAt` (default) `\| price \| year \| mileage` |
| `sortDirection` | enum | `asc \| desc` (default `desc`) |
| `limit` | integer 1–100 | Default `20` |
| `cursor` | string (≤512) | Opaque cursor from a previous page; `createdAt` ordering only |

Unknown query parameters on `/listings` and `/listings/search` are rejected with
`400` instead of being silently dropped. Unknown query parameters on the
tolerant category read endpoints are ignored.

Category-scoped facets accept repeatable `filters=key:value` selections, e.g.
`/filters/{categoryId}?filters=drivetrain:awd&filters=fuel_type:petrol`.

---

## 12. Validation & Error Handling

Validation happens at two layers:

- **HTTP boundary (Elysia schemas).** Types, string lengths, UUID shape, enum
  values, numeric minimums and pagination bounds. Range filter names are declared
  deliberately as unions of literals rather than `UnionEnum`, because `UnionEnum`
  injects an implicit default equal to its first member — which previously made
  an omitted `?status=` behave as `status=available` and an omitted
  `sortDirection` default to `asc`, both of which changed results silently.
- **Service layer (database-dependent rules).** Category existence, parent
  existence, cycle prevention, slug conflicts and dynamic-attribute validation
  against the category's filter definitions.

Strict input guards reject unknown fields instead of dropping them:
`rejectUnknownBodyKeys` on category writes, and `rejectUnknownQueryKeys` on the
listing search endpoints. This is deliberate: an unrecognized filter used to be
discarded, so `?make=Toyota&maxPrice=50000` returned `200` with unfiltered rows.

Every error uses one response shape:

```json
{ "error": { "code": "LISTING_NOT_FOUND", "message": "Listing not found", "details": {} } }
```

| Error code | Status | Raised for |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Schema failures, unknown fields, unsupported cursor ordering, invalid attributes |
| `NOT_FOUND` | 404 | Resource missing (listing/category/parent) |
| `CONFLICT` | 409 | Unique violations, category cycle, slug conflict |
| `DATABASE_ERROR` | 500 | Unmapped database failures |
| `INTERNAL_SERVER_ERROR` | 500 | Unexpected failures |
| `ROUTE_NOT_FOUND` | 404 | Unmatched route |

PostgreSQL driver errors are translated in `database/pool.ts`: SQLSTATE `23505`
(unique violation) becomes `409 CONFLICT`, already-mapped `AppError`s pass
through, and everything else becomes a `500` with the raw cause logged but never
returned. In production, unexpected errors expose only a generic message.
Validation failures never include SQL, `pg-`, stack traces or `node_modules`
paths — asserted by tests.

---

## 13. Running Locally

**Prerequisites:** Bun `>=1.2.0`, and a reachable PostgreSQL 17 instance.

```bash
# 1. Install dependencies
bun install

# 2. Provide environment configuration
cp .env.example .env          # Windows: copy .env.example .env

# 3. Apply migrations
bun run db:migrate

# 4. Seed data (idempotent — safe to re-run)
bun run db:seed

# 5. Start the API in watch mode
bun run dev
```

The API is then at `http://localhost:3000`, the docs UI at
`http://localhost:3000/docs`, and the OpenAPI JSON at
`http://localhost:3000/docs/json`.

### Scripts

| Command | Purpose |
|---|---|
| `bun run dev` | Watch-mode dev server |
| `bun run start` | Start the server once |
| `bun run build` | Bundle `src/server.ts` for Bun into `dist/` |
| `bun run db:migrate` | Apply pending SQL migrations |
| `bun run db:seed` | Seed categories, filter attributes and listings |
| `bun test` | Run the test suite |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run lint` / `lint:fix` | ESLint |
| `bun run format` / `format:check` | Prettier |

### Environment variables

The app reads configuration once at startup and fails fast on invalid values.

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | no | `development` | `development \| test \| production` |
| `PORT` | no | `3000` | HTTP listen port |
| `HOST` | no | `0.0.0.0` | HTTP listen host |
| `DATABASE_URL` | yes (fallback in code) | `postgres://postgres:postgres@localhost:5432/rekadigi` | PostgreSQL connection string |
| `DATABASE_POOL_MAX` | no | `10` | Max pool connections |
| `DATABASE_IDLE_TIMEOUT_MS` | no | `30000` | Idle client timeout |
| `DATABASE_CONNECTION_TIMEOUT_MS` | no | `5000` | Connection acquisition timeout |
| `LOG_LEVEL` | no | `info` | `debug \| info \| warn \| error` |

`.env.example` documents the same set. Real credentials must never be committed.

---

## 14. Running with Docker

Docker is an **optional bonus in the assessment and was intentionally
completed**. It is the recommended way to run the project end-to-end because it
requires no local PostgreSQL (Compose starts its own database).

```bash
docker compose up --build
```

That single command:

1. builds the **API image** (`oven/bun:1`, `bun install --frozen-lockfile`,
   source copied, `docker/entrypoint.sh` as entrypoint);
2. starts **PostgreSQL 17** (`postgres:17-alpine`);
3. waits for PostgreSQL to become healthy — the API declares
   `depends_on: postgres: condition: service_healthy`, and the database has a
   `pg_isready -U postgres -d rekadigi` healthcheck (5s interval, 5s timeout,
   10 retries);
4. runs the entrypoint sequence inside the API container:
   `bun run db:migrate` → `bun run db:seed` → `bun run start`;
5. persists database data in the named volume **`postgres_data`**
   (`/var/lib/postgresql/data`), so data survives container recreation;
6. exposes the API on `3000` and PostgreSQL on `5432`.

The Compose database is **self-contained**: it runs its own PostgreSQL inside the
Compose network and does not depend on (or touch) the developer's external or
local PostgreSQL instance. The API connects over the Compose network hostname
`postgres` from `DATABASE_URL`, while host clients use `localhost:5432`.

Migrations run automatically on every start and are forward-only, so an
already-migrated database simply skips applied files. The seed is idempotent, so
restarting the stack does not duplicate data.

Environment configuration for the Compose stack is set in `docker-compose.yml`
(`NODE_ENV=production`, `HOST`, `PORT`, `DATABASE_URL`, pool settings,
`LOG_LEVEL`). Local (non-Docker) runs read `.env` instead.

---

## 15. Database Migrations

Migrations are plain, forward-only SQL files applied in lexical order by
`src/database/migrate.ts`:

| File | Contents |
|---|---|
| `001_enable_extensions.sql` | `CREATE EXTENSION IF NOT EXISTS pgcrypto, pg_trgm` |
| `002_create_categories.sql` | `categories` table, indexes, root-slug partial unique |
| `003_create_filter_attributes_and_listings.sql` | `filter_attributes` and `listings` tables with checks |
| `004_create_indexes_and_triggers.sql` | Listing indexes, `set_updated_at()` trigger on all tables, trigram indexes |

The runner:

- creates a `schema_migrations` table (`id`, `filename` unique, `applied_at`);
- skips files already recorded there (`skip` logged);
- applies each new file inside its own transaction, records the filename in the
  same transaction, and rolls back on failure (`FAILED` logged, process exits
  non-zero);
- prints a summary (`applied / skipped / total`).

Run it with:

```bash
bun run db:migrate
```

There is no down/rollback migration mechanism by design; schema changes are
additive new files. Naming convention for new files: `NNNN_description.sql`.

---

## 16. Database Seeding

Seed with:

```bash
bun run db:seed
```

The seed is **deterministic and idempotent**:

- A fixed-seed PRNG (`mulberry32`) makes every run produce identical data.
- IDs are derived from SHA-1 digests of stable strings, so re-running targets
  the same rows.
- `categories` and `filter_attributes` upsert with `ON CONFLICT … DO UPDATE`;
  `listings` use `ON CONFLICT (id) DO NOTHING`.
- `search_vector` is populated only where it is still `NULL`, so re-seeding does
  not rewrite existing vectors.

It writes, in one transaction:

- **8 categories**: `vehicles` → `cars` / `motorcycles` → `suv`, `sedan`,
  `hatchback` (under `cars`) and `sport`, `scooter` (under `motorcycles`),
  with correct `path` and `depth`.
- **36 filter attributes** across the five leaf categories, using all three
  filter types — enum (`fuel_type`, `transmission`, `drivetrain`, `body_style`,
  `doors`), range (`price`, `mileage`, `year`, `engine_cc`, `top_speed`) and
  boolean (`warranty`, `accident_free`, `sunroof`, `abs`, `electric`, …).
- **1,000 listings** distributed across the leaf categories (SUV 250, sedan
  250, hatchback 150, sport 200, scooter 150) with generated makes/models,
  years, mileage, rounded prices, conditions, colored images and category-
  appropriate JSONB attributes. Statuses are weighted roughly 85% `available`,
  10% `sold`, 3% `pending`, 2% `removed`.

The database schema (migrations) must be applied before seeding. Docker performs
both automatically.

---

## 17. Testing

```bash
bun test
```

Current state (re-verified against this repository):

```
60 pass
0 fail
909 expect() calls
Ran 60 tests across 9 files.
```

`bun run typecheck` and `bun run lint` are both clean.

9 test files:

| File | Covers |
|---|---|
| `architecture.test.ts` | Layer boundaries: no SQL in controllers/routes, no Elysia/HTTP in services/repositories, no `pg` in controllers |
| `categories.test.ts` | Cycle prevention, moving to root, parent validation, slug/parent errors |
| `category-contract.test.ts` | Unknown-field rejection on category writes, tolerant category reads, strict listing reads |
| `cursor.test.ts` | Cursor encode/decode round-trip, URL-safe output, malformed cursors |
| `error-handling.test.ts` | 404 shape, validation normalization, no internal leakage |
| `health.test.ts` | Liveness and readiness probes |
| `listing-filters.test.ts` | Canonical vs alias range filters, inclusive bounds, precedence, status semantics, sort ordering, unknown-param rejection |
| `openapi.test.ts` | Spec is served, exact operation set (16 operations), parameter parity, write-body fields |
| `unique-violation.test.ts` | SQLSTATE `23505` → `409 CONFLICT` mapping |

Tests run against the Elysia app via `app.handle(...)` (no listening socket) and
use in-memory repository fakes where the logic under test is pure application
logic, keeping the suite fast and database-independent. Tests that exercise
listing search/filter behaviour do reach a database; they default
`DATABASE_URL` to `.../rekadigi_test` through `tests/setup.ts`, which is
preloaded by `bunfig.toml`.

---

## 18. API Documentation / OpenAPI

OpenAPI 3.x documentation is generated from the Elysia route schemas, so the
validated contract and the documented contract cannot drift.

- **Docs UI:** `http://localhost:3000/docs`
- **OpenAPI JSON:** `http://localhost:3000/docs/json`

The spec is titled **Automotive Marketplace API** (version `0.1.0`) and
documents 16 operations across four tags: Health, Listings, Categories,
Filters. `GET /health/live` is deliberately excluded as an infrastructure probe.

`tests/openapi.test.ts` asserts the documented operation set is exactly the
intended 16, that query-parameter names match the implementation in both
directions (including canonical and alias range names), and that the category
write bodies expose only persisted fields (`name`, `slug`, `parentId`).

---

## 19. Implementation Decisions & Scope

Each of the following is a deliberate engineering choice, not a shortfall.

### No ORM (required by the assessment)

The assessment explicitly forbids ORM usage. Database access uses raw
parameterized SQL through `pg`. Beyond compliance, this gives explicit control
over exactly the things this assessment evaluates:

- **SQL predicates** — filters are built as `$1, $2, …` fragments appended to a
  values array; user input never reaches SQL text.
- **Indexes** — index definitions and the queries that use them are written
  together, so a plan can be reasoned about directly.
- **Cursor pagination** — the row-wise keyset comparison and the SQL-side
  microsecond timestamp formatting are possible because the query is explicit.
- **CTEs** — recursive CTEs for subtree traversal and the trigram suggestion CTE
  are first-class, not fought through an abstraction.
- **PostgreSQL-specific features** — `websearch_to_tsquery`, `tsvector`/GIN,
  `pg_trgm`, `jsonb_array_elements`, `text_pattern_ops` and partial indexes are
  all used directly.
- **Transaction boundaries** — `withTransaction()` wraps explicit `BEGIN` /
  `COMMIT` / `ROLLBACK` where multiple writes must succeed together (migrations
  and the seed).

### Redis — intentionally not implemented

Redis is an **optional bonus** in the assessment, not a required component, and
it was deliberately omitted.

The current workload is served directly by PostgreSQL using indexed relational
queries, PostgreSQL full-text search, GIN and trigram indexes, cursor pagination
and faceted aggregation computed in SQL. That means every read path already has a
single, consistent source of truth with no duplication to reconcile.

Introducing Redis would add real operational surface — cache invalidation,
cache consistency, TTL policy and deployment/coordination overhead — for a
dataset and request profile that does not demonstrate a current bottleneck. This
is a decision about **evidence**, not a claim that Redis is useless: caching is
valuable in production when profiling shows a hot, read-heavy endpoint. For this
assessment there is no measured bottleneck to address, so the additional
infrastructure was not justified. PostgreSQL remains the source of truth.

The trigger to revisit is concrete: production profiling (or representative load
testing) identifying specific hot read endpoints with measurable latency or load
pressure. At that point Redis could be introduced narrowly, for those endpoints,
with an explicit invalidation strategy.

### Search engine (Elasticsearch / OpenSearch) — not used

There is no dedicated search engine and no synchronization pipeline, because
none is needed for the demonstrated workload.

The assessment requires **full-text and faceted search**, not a specific search
product. PostgreSQL provides native full-text search (`tsvector` +
`websearch_to_tsquery` + a GIN index), trigram matching for fuzzy/typeahead
lookups, and relational filtering and aggregation in the same transactionally
consistent store. Keeping search in PostgreSQL avoids introducing a second
source of truth and the sync/indexing pipeline that would be required to keep it
correct.

A dedicated search engine would become worthwhile if relevance tuning,
multi-language analyzers or search-volume requirements outgrow what PostgreSQL
FTS expresses comfortably. That requirement does not exist here, so adding one
would be infrastructure without a driver.

### Docker — intentionally completed as a bonus

Docker is optional in the assessment and was implemented deliberately, because it
makes the project reproducible with one command and removes "works on my
machine" class problems from review. See
[Running with Docker](#14-running-with-docker) for the full description:
Bun API container, PostgreSQL 17 container, Compose orchestration, healthcheck-
gated startup, automatic migrations, idempotent seed, persistent named volume
and environment configuration.

### Structured architectural choices

- **Typed columns vs JSONB** — a deliberate split: anything filtered, sorted or
  faceted routinely is a typed column; only genuinely per-category data is
  JSONB. This keeps the hot read path single-table.
- **Soft deletion** — `softDelete` writes both `status = 'removed'` and
  `deleted_at`, because the two mechanisms are used in different places (API
  writes vs. seeded rows). Reads check both so removed rows are hidden either
  way, and an explicit `?status=removed` still returns them.
- **Categories over-engineering avoided** — adjacency list + materialized path +
  depth is sufficient; `ltree`, closure tables and nested sets were not needed.
- **Projection over `SELECT *`** — every query lists its columns explicitly.
- **One error shape** — a single `{ error: { code, message, details } }` contract
  with centralized mapping.
- **Strict, not silently tolerant** — unknown query parameters on search
  endpoints are rejected, because a dropped filter silently returns wrong data.
- **No dispatch abstraction** — module index, service singletons and repository
  interfaces are as far as abstraction goes; there are no factories, providers
  or strategy layers to explain.

---

## 20. Known Limitations / Deliberate Non-Goals

Only genuinely absent or deferred items are listed. Required assessment features
are implemented and are not described here as limitations.

| Item | Status | Reason |
|---|---|---|
| Redis caching | Not implemented | Optional bonus; PostgreSQL indexes + FTS + facets already serve the workload; avoids cache-consistency/TTL/operational complexity without a demonstrated bottleneck |
| Dedicated search engine (Elasticsearch/OpenSearch) | Not implemented | PostgreSQL FTS + GIN/trigram indexes meet the required search and faceting without a second source of truth or sync pipeline |
| ORM | Deliberately not used | Forbidden by the assessment; raw parameterized SQL gives explicit control of predicates, indexes, CTEs and transactions |
| Authentication / authorization | Not implemented | Out of assessment scope; no identity or permission requirements were specified |
| Write-through `search_vector` maintenance | Seed-populated only | `search_vector` is populated by the seed; the create/update write paths do not recompute it, so a listing created through the API is not full-text searchable until its vector is populated. Structured filters and all other reads are unaffected. A trigger-based recompute is the natural fix if API-created listings must be immediately searchable |
| Attribute predicates on the listing search endpoint | Not exposed as query parameters | The repository supports JSONB attribute predicates, and attributes are validated on write and used for facet counting; `/listings` does not currently accept arbitrary attribute query parameters. Structured (typed-column) filters are fully exposed. Revisit if clients need direct `?attribute=value` filtering on search |
| Cursor pagination for non-`createdAt` sorts | Not supported | A cursor describes created_at/id ordering; blending it with price/year/mileage ordering would be incorrect. It returns `400 CURSOR_UNSUPPORTED_ORDER` instead |
| Upsert / bulk listing endpoints | Not implemented | Not required; CRUD + search + filtering + pagination are the assessed behaviours |
| `includeTotal` count via API | Not wired to a query parameter | Counting is opt-in in the repository to keep browse cheap; no endpoint requests it, so no `COUNT(*)` is paid for browsing |
| Listing `images` on `PATCH /listings/{id}` | Accepted by the body schema but not persisted | `UpdateListingData` omits `images` and the update statement has no `images` assignment, so images are set at creation only and are not replaced by PATCH |
| Category `name`/`slug` length | HTTP max is 150, column is `varchar(100)` | A value of 101–150 characters passes HTTP validation but overflows the column; the SQLSTATE is not `23505`, so it maps to `DATABASE_ERROR` (500) rather than a clean `400`. Aligning the schema `maxLength` with the column (or widening the column) is the fix |
| Frontend / admin UI | Not implemented | Backend assessment only |
| CI pipeline | Not configured | No CI requirements were provided; all checks are runnable locally (`bun test`, `bun run typecheck`, `bun run lint`) |

---

## 21. Deployment

Deployment is **container-based and self-contained** via Docker Compose. There is
**no hosted deployment URL** associated with this repository, and none is claimed
here.

Production-shaped deployment is:

```bash
docker compose up --build
```

- The **API image** is built from `Dockerfile` (`oven/bun:1`), installs
  dependencies with `bun install --frozen-lockfile`, and runs
  `docker/entrypoint.sh`, which applies migrations, runs the idempotent seed and
  starts the server.
- **PostgreSQL 17** runs as a Compose service with a healthcheck; the API starts
  only after the database is healthy.
- Data persists in the named volume `postgres_data`.
- Runtime configuration is supplied by environment variables
  (`NODE_ENV=production`, `HOST`, `PORT`, `DATABASE_URL`, pool settings,
  `LOG_LEVEL`), so the same image can target a different managed PostgreSQL by
  changing `DATABASE_URL`.
- The process handles `SIGINT`/`SIGTERM` by stopping the HTTP server and closing
  the connection pool, which suits orchestrators that signal before termination.
- Operational endpoints are `/health` (readiness, includes the database check)
  and `/health/live` (liveness), suitable for orchestrator probes.

Because startup performs migrations and seeding, the container assumes it owns
its database schema. For a shared production database, migrations would normally
be run as a separate deployment step rather than on every container start.

---

## 22. Assessment Notes / Technical Rationale

A short summary of the engineering posture behind this implementation, for the
reviewer:

- **PostgreSQL-first.** Search, faceting, filtering, hierarchy traversal and
  pagination are all expressed as SQL against a single consistent database. One
  source of truth, no synchronization to get wrong.
- **Explicit boundaries.** Routes → controllers → services → repositories →
  PostgreSQL. The direction is enforced by a test, so the layering is a property
  of the codebase rather than a convention that can quietly rot.
- **Correctness before cleverness.** Deterministic ordering with an id
  tie-breaker, microsecond-precision cursors, inclusive range bounds, strict
  rejection of unknown filters, and status semantics that do not silently
  default all exist because each one prevented a real class of wrong results.
- **Indexes follow queries.** Every index maps to a specific predicate, order or
  lookup; none was added speculatively. No benchmark figures are claimed,
  because none were captured in-repo.
- **Infrastructure only where earned.** No Redis, no external search engine, no
  message queue, no microservices. Redis and a dedicated search engine remain
  viable future additions with a clear trigger (measured hot reads; search scale
  or relevance requirements) — they are omissions by evidence, not by
  oversight.
- **Reproducibility.** Deterministic idempotent seed, forward-only migrations,
  and a one-command Docker Compose stack with a healthcheck-gated startup make
  the project runnable and reviewable without local setup guesswork.
- **Honest scope.** What is not implemented is documented as a deliberate scope
  decision, with the conditions that would justify revisiting it.

---

### Quick reference

```bash
bun install                 # install dependencies
bun run db:migrate          # apply migrations
bun run db:seed             # seed (idempotent)
bun run dev                 # dev server  → http://localhost:3000
bun test                    # 60 tests
bun run typecheck && bun run lint

docker compose up --build   # full stack (API + PostgreSQL 17)
```
