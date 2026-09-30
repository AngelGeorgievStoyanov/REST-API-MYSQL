# HackTrip Backend — Architecture Rules

This file is the architectural source of truth for the backend. It describes the
rules every vertical slice must follow. It intentionally does not document the
implementation details of individual slices.

## Vertical slices

The backend is built as vertical slices. A slice owns everything it needs from
HTTP down to the database. A typical slice looks like:

```text
src/controllers/<slice>Controller.ts
src/services/<slice>Service.ts
src/repositories/<slice>Repository.ts
src/model/<slice>.ts
src/constants/<slice>.ts
src/utils/<slice>.ts
```

Add only the files that are actually needed. A slice with database or business
logic must have its own repository and its own business layer. Do not create
abstractions or frameworks "just in case".

## Dependency flow

```text
FE → Controller → Service → Repository → Prisma → MySQL
```

Never skip a layer downwards (no Prisma in a controller) and never reach upwards
(a repository must not know about HTTP).

## Controller

The controller is a thin HTTP layer.

Responsibilities:

- parse HTTP request input (params, query, body);
- act as the authentication boundary;
- call the service;
- set HTTP status codes;
- shape the response.

A controller must not contain Prisma, SQL, database queries, business logic or
complex validation. It must not build repositories or services.

## Service

The service is the business layer.

Responsibilities:

- business rules;
- domain/business validation;
- authorization and ownership rules;
- orchestration of repository calls;
- DTO mapping;
- converting request DTOs into repository inputs.

A service never uses Prisma or MySQL directly, and never creates its own
dependencies.

Dependencies are injected through the constructor:

```ts
export class TripService {
    constructor(private readonly repository: TripRepository) { }
}
```

Keep classes and constructor injection. Do not convert classes to plain
functions for style reasons.

DTO mapping, request-to-repository mapping and other service-local helpers stay
in the service. Do not extract them into `utils` just to make the service
shorter.

## Repository

The repository is the database access layer of one slice.

- it uses the shared Prisma client;
- it holds the Prisma queries;
- it holds database-specific persistence logic.

Do not introduce a generic CRUD repository framework, query builder or ORM layer
on top of Prisma. Each slice owns its queries.

Do not use `mysqlPool`, `runQuery`, `$queryRaw` or `$executeRaw` unless a
specific task explicitly requires raw SQL. Raw SQL is a last resort, not a
default.

## Prisma

Use the single shared client:

```ts
import { prisma } from '../clients/prisma';
```

Never create another `PrismaClient` in a slice, service, repository or
controller. Never create a separate database connection or pool for a slice.

## Container

`src/container.ts` is the composition root. It only assembles dependencies:

```text
Prisma → Repository → Service → exported service
```

It does not load models, DTOs, database data, runtime configuration or business
state. Do not comment obvious dependency wiring there.

## Constants

- Slice-specific constants → `src/constants/<slice>.ts`
- Genuinely shared constants, used by more than one slice → `src/constants/common.ts`

Never keep slice-specific constants inside a service or repository. Do not
pre-create `common` abstractions: something is shared only when more than one
slice really uses it.

## Utils

Reusable helpers live in `src/utils`.

- genuinely generic helpers → the matching generic utility file;
- slice-specific helpers → `src/utils/<slice>.ts`.

If a helper is used once and has no real reuse value, leave it where it is — do
not move code around just to make a file shorter. If a helper starts being used
by more than one slice, decide whether it belongs in a shared utility.

Before writing a helper, check whether an equivalent shared utility already
exists and use that one. Do not create a new utility file (for example a date or
number module) only to host one or two small helpers: keep them next to their
only consumer until a second slice really needs them.

Never duplicate the same reusable helper across slices.

Genuinely shared pure conversion/normalization helpers belong in
`src/utils/utils.ts`; domain-specific and validation-specific helpers stay in
their own specialized modules. Before writing a generic helper, search the
repository for an existing equivalent and reuse it — do not create abstractions
without real reuse.

## Models / DTOs

API DTOs and domain/application types must not expose Prisma models directly.
Prisma rows are mapped to DTOs inside the slice.

The API contract may deliberately differ from the legacy database structure. Do
not keep a legacy FE structure only for backward compatibility when the new
contract explicitly replaces it.

## IDs / legacy naming

New code uses:

```text
id
ownerId
tripId
pointId
targetId
targetTypeId
```

Do not introduce `_id`, `_ownerId`, `_ownerTripId` or similar underscore-prefixed
legacy names in new models, DTOs, repositories or services.

If legacy code still returns `_id`, the compatibility mapping must be isolated on
the boundary (for example the authentication boundary) and must not leak into
domain, service, repository or model code. When a legacy slice is migrated, its
legacy ID naming is removed as part of that migration.

## Comments

Code must be self-explanatory through good names, types and structure.

Do not add comments that describe obvious code or obvious architecture. Never
write comments such as:

- `GET /api/...` or `POST /api/...` endpoint markers;
- `this calls repository`, `service calls repository`;
- `HTTP layer`, `Business layer`, `Shared service instance`;
- `no Prisma here`, `no SQL here`;
- descriptions of an obvious `const`, `return`, `await` or constructor.

Use a comment only to explain a genuinely non-obvious reason:

- a business rule;
- a legacy database constraint;
- compatibility behavior;
- a non-obvious transaction or lifecycle reason;
- a non-obvious architectural reason that cannot be derived from the code.

If the reason can be expressed better through a function name, a variable name or
a better structure, prefer the code over the comment. Do not leave a comment
behind only because it "might help an AI": AI must understand the code from
structure, names and types.

## Dynamic configuration

`dynamicConfig` is the runtime configuration cache and the only owner of its
lifecycle (initial load, cache, refresh, timers). Startup must ensure dynamic
configuration is loaded before slices that depend on it start serving requests.

Slices must not issue their own queries to configuration tables per request when
the value is already provided by `dynamicConfig` through its accessors.

## Validation

Keep generic request/input parsing helpers separate from slice-specific domain
validation.

Generic primitives (string/number/boolean parsing, shape checks) may be shared.
Business rules stay in the service/domain layer.

## Testing a slice

When a slice is finished:

1. run the TypeScript check;
2. check imports;
3. verify runtime/API behavior when possible (real endpoints, real responses);
4. verify database integrity when the slice changes data;
5. keep pre-existing errors separate from errors introduced by the slice.

Do not "fix" unrelated pre-existing problems as part of a slice unless the task
explicitly asks for it.

