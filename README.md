# Burbot Studio

Frontend workspace for creating Burbot business models and registering atomic
schema revisions.

## Current views

- **Business models** — creates a top-level model namespace through the generated
  FastAPI client.
- **Revision studio** — Monaco editor for Burbot's Python-style schema language,
  with Python syntax highlighting, type/constraint/reference completions, hover
  documentation, `Field(...)` signature help, go-to-definition, an entity outline,
  local drafts, semantic diagnostics, and revision registration.

## Schema language

The editor opens `burbot-schema.py` with a valid Project/Recruitment template.
For example:

```python
class Project:
    table_name: "e_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    name: str = Field(nullable=False, unique=True, max_length=100)
    budget: Decimal = Field(precision=12, scale=2, ge=0)

class Recruitment:
    table_name: "e_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    project_id: Reference = Field(reference="Project", nullable=False, index=True)
    status: str = Field(max_length=80, default="open")
```

Use **Add entity** or the `class` / `table_name` completions to generate a fresh
table identifier. The example IDs above illustrate the required format; templates
generate 256 random bits encoded as `e_` plus 52 lowercase base32 characters. Keep
the table identifier unchanged when renaming a class. There is no identifier
generation endpoint in the supplied OpenAPI contract.

- All backend types are supported: `String`, `Text`, `Integer`, `BigInteger`,
  `Float`, `Decimal`, `Boolean`, `Date`, `DateTime`, `UUID`, `JSON`, `Reference`.
- Python aliases: `str` → `String`, `int` → `Integer`, `float` → `Float`,
  `bool` → `Boolean`, `date` → `Date`, `datetime` → `DateTime`, `dict` → `JSON`.
- References target an **entity name**, such as `"Project"`, rather than
  `"Project.id"`. `project: Project`, `project: Reference[Project]`, and
  `project: Reference["Project"]` are supported, including forward references.
- Fields default to `nullable=True`, `unique=False`, `index=False`, and
  `primary_key=False`. Optional constraints, `default`, and `reference` default
  to `None`, matching the backend. Burbot reserves `id`; don't declare it.
- `Field(...)` accepts named options from the backend contract. Direct literal
  defaults, such as `count: int = 0`, are also supported. Values must be literals;
  imports, calls, expressions, methods, inheritance, and decorators are rejected.
- Comments, docstrings, multiline calls, raw strings, lists, and dictionaries
  with string keys are supported. Python source is parsed, never executed.
- `table_name: "..."`, `table_name = "..."`, and
  `table_name: str = "..."` work. `tablename` / `__tablename__` are accepted as
  aliases. The emitted backend property is always `tablename`.

The frontend compiles source into the generated API's `Schema` representation
and submits `{ schema, reason, metadata_json }` to
`POST /api/v1/business/models/{model_id}/revisions`. Entity and field locations
come from the AST, with one-based line/column positions for Monaco (end columns
are exclusive). It mirrors the supplied backend `Sema.validate` rules for
reserved/duplicate names, table IDs, primary keys, constraint compatibility,
numeric/string/decimal bounds, and reference resolution. The backend remains
authoritative and validates every submitted schema again.

Existing JSON drafts are converted to Python-style source on first open. The
old storage key is kept as a backup. Conversion preserves identities and fields:
legacy `projects` table names, explicit `id` fields, or `Project.id` references
are diagnosed rather than silently rewritten. New drafts use a versioned storage
key and a Monaco model URI per business model.

## Development

```bash
npm install
cp .env.example .env
```

Set the public API domain in `.env`:

```dotenv
VITE_API_BASE_URL=http://localhost:8000
```

Then start Vite:

```bash
npm run dev
```

The generated client prefixes every `/api/...` path with this value. Leave it
empty when the frontend and API share a domain and an upstream proxy handles
`/api`. Because Vite embeds public environment variables at build time, rebuild
the frontend image after changing the value:

```bash
docker compose build fe
docker compose up -d fe
```

When a different API domain is used, the Business Driver must allow the
frontend origin through CORS.

## Checks

```bash
npm run build
npm run lint
npm test
```

Tests use Node's built-in TypeScript stripping (Node 22.18+ or Node 24+).

Regenerate the typed API client after updating `openapi.json`:

```bash
npm run api:generate
```
