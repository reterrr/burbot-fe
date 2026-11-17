# Burbot Studio

Frontend for the Burbot business definition, language, and data APIs. The checked-in
contract is exported from `reterrr/burbot` commit
`d735435f272b85a44655802f8eeaecf1f5eec419` (the revision is also recorded in
`openapi.json` under `info.x-backend-revision`).

## Workflows

- **Business models:** load models from the server, create a namespace, edit its
  name/description/metadata, or delete an empty model. Choose an existing model
  to manage it, then open its program studio. Model listing follows all API pages.
- **Program studio:** edit the current restricted Python language with Monaco
  highlighting, constructor/constraint completions, signature help, hover,
  formatting, go-to-definition, an outline, and local drafts. The backend
  compiler validates each draft after a short debounce; diagnostics appear in
  the editor and Problems tab. Validation never applies changes.
- **Preview and apply:** preview schema changes against the selected model.
  **Execute program** applies definitions and upserts named objects atomically;
  **Register schema only** applies definitions without seed data. The preview
  must match the current source before either action is enabled. Execution shows
  the revision, definition code version, named object IDs, and create/update counts.
- **Schema revisions:** browse the server's paginated revision history and load
  current or historical declarations into a draft, preserving entity table names
  and persistent field keys. Loading is explicit because it replaces the draft.
- **Business objects:** browse entities, field definitions, relations, objects,
  and their histories. Create objects or edit JSON values by logical field name;
  the frontend maps them to the definition IDs for creation and object slot IDs
  for updates. Updates include `expected_value_ids` for conflict detection.
  Archive/restore, protected deletion, field synchronization, and paginated
  value/definition/relation histories are available. Valid-at and known-at UTC
  filters provide a read-only historical view; labels use current definitions.

The backend enforces constraints, required/default values, referential integrity,
uniqueness, and deletion protection. System fields such as `id` are read only.
References and `Source` values use integer IDs; exact decimal values can be strings.

## Current schema language

```python
class ProjectStatus(Enum):
    OPEN = "open"
    CLOSED = "closed"

class Project(Entity):
    name: String(persistent_key="name", nullable=False, unique=True)
    budget: Decimal(persistent_key="budget", precision=12, scale=2, ge=0)
    status: ProjectStatus(persistent_key="status", default=ProjectStatus.OPEN)
    source: Source(persistent_key="source")

class Recruitment(Entity):
    project: Reference(Project, persistent_key="project", nullable=False)
    closes_on: Date(persistent_key="closes_on")

project = Project(name="Example project", budget="100.00")
recruitment = Recruitment(project=project, closes_on="2026-12-15")
```

Types are `String`, `Text`, `Integer`, `BigInteger`, `Float`, `Decimal`, `Boolean`,
`Date`, `DateTime`, `UUID`, `JSON`, `Source`, entity references, and declared enums.
The API uses lowercase type names. Imports, arbitrary calls, and execution of
user Python are not supported. The backend owns parsing and semantic validation;
frontend suggestions do not decide whether a program is valid.

Keep `persistent_key` unchanged when renaming a field. For entity renames, load
the current schema first and retain its explicit `tablename`, for example
`class Portfolio(Entity, tablename="e_..."):` with the complete saved identifier.
Otherwise the backend resolves table names using the selected model. Fields
distinguish an omitted default (`has_default=False`) from an explicit null default.

The studio stores edits at `burbot:program-draft:v2:<model ID>`. Older Python and
JSON drafts are migrated on first open; their original storage keys remain as
backups. Migration preserves existing table identifiers and field identities.
Invalid legacy definitions remain visible for backend diagnostics.

Schema revisions contain declarations, not named seed source. Reconstructing a
saved schema cannot recover seed statements. Local drafts retain the full program.
The current backend persists definition code versions and returns `code_version`
on execution, but exposes no HTTP routes to browse/restore that source history;
the frontend therefore uses the available schema revision endpoints.

## Development

Use Node 24 and install the checked-in dependency versions:

```bash
npm ci
cp .env.example .env
npm run dev
```

The default uses Vite's development proxy:

```dotenv
VITE_API_BASE_URL=
BURBOT_API_TARGET=http://localhost:8000
```

`BURBOT_API_TARGET` is a development server setting. Browser requests use
`/api/v1/business/...`, so no cross-origin setup is necessary for this mode.
Alternatively set `VITE_API_BASE_URL` to a browser-accessible API origin. A
different origin requires backend CORS configuration. This public value is
embedded at build time; rebuild after changing it.

The Docker frontend shares the external `burbot` network and proxies `/api` to
`bot:8000`, matching the backend Compose service. Run the backend first, then:

```bash
docker compose up --build -d fe
```

The frontend is served at `http://localhost:8001`.

## Checks and API regeneration

```bash
npm test
npm run lint
npm run build
```

Unit tests cover draft migration, source reconstruction, default/identity
preservation, completions, Unicode diagnostic columns, object ID mappings,
optimistic update payloads, and API errors.

To update the contract, use the backend's Python environment to export its
actual business routers, then regenerate the Orval client:

```bash
../burbot/.venv/bin/python scripts/export-business-openapi.py ../burbot
npm run api:generate
```

The exporter mounts the business routes at `/api/v1`, as `business_layer.main`
does, without opening a database connection or importing unrelated routers. The
backend's checked-in `openapi.json` is older than these routes and should not be
copied directly. Generated clients and models are committed with this frontend.

An optional conformance check compiles templates and migrated drafts with the
real backend compiler and verifies schema-to-source round trips:

```bash
BURBOT_PYTHON=../burbot/.venv/bin/python npm run test:backend -- ../burbot
```

At the pinned backend revision, importing `business_layer.main` fails because
`sources.api.dependencies` imports the deleted `sources.services.sources` module.
That backend startup issue must be fixed before a full live database workflow
can run. Business-only contract export and compiler conformance checks work
independently of it.
