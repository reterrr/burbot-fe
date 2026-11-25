# Burbot Studio

Frontend for the Burbot business definition, language, and data APIs. The checked-in
contract is exported from `reterrr/burbot` commit
`d735435f272b85a44655802f8eeaecf1f5eec419` (the revision is also recorded in
`openapi.json` under `info.x-backend-revision`).

## Application architecture

`src/main.tsx` connects the shared Ant Design theme and notifications to Refine.
Refine owns the TanStack Query client, resource data, and mutations. The
React Router hash routes preserve `#/models`, `#/revisions`, and `#/objects`.
The shared Studio shell retains the selected model while users switch sections.
The existing Business views, generated Orval client, and Monaco draft keys
remain in their original modules. Ant Design uses component-scoped styles and
the dark and compact algorithms configured in `src/app/studio.ts`.

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

## Task management

The Studio includes four hash routes for local development with the matching
Burbot Task API.

| Route | Workflow |
| --- | --- |
| `#/tasks` | Actionable Inbox, count badge, server filters, pagination, and status actions |
| `#/tasks/:id` | Task details, workflow and evidence references, metadata, and available transitions |
| `#/tasks/:id/review` | Canonical value, previous/current evidence, and source references when the local operator token is configured |
| `#/tasks/history?source=:id` | Paginated source workflows. Add `workflow=:id` to open its details and historical tasks |

The task adapter in `src/features/tasks/api` reuses the shared HTTP transport
and maps inbox `items[].task.id` into Refine resource IDs. The adapter uses the
backend totals, passes `offset` and `limit`, and verifies `applied_filters`
before displaying filtered results. `allowed_statuses` comes from the backend's
current workflow and task rules. A successful status update refreshes dependent
queries. A stale workflow returns `409` and causes the Studio to reload the task.

The backend endpoints are `GET /tasks/inbox`, `GET /tasks/inbox/count`,
`GET /tasks/{id}`, `PATCH /tasks/{id}/status`,
`GET /tasks/sources/{id}/workflows`, `GET /tasks/workflows/{id}`, and
`GET /tasks/workflows/{id}/tasks`. Inbox filters use `status`, `type`, `reason`,
`source_id`, and exact `task_id`. The Source DTO exposes a URL and no display
name, so Inbox rows show Source IDs without additional requests.

## Monitoring workspace

Open **Monitoring → Attention** from the Studio activity bar.

| Route | What it shows |
| --- | --- |
| `#/monitoring/attention` | Server-paginated sources that need attention, with source and field outcomes, open tasks, search, filters, and priority sorting |
| `#/monitoring/sources` | All monitored sources, including healthy sources |
| `#/monitoring/sources/:sourceId` | Latest check, reviewable history, canonical and captured values, field inspector, and open tasks from earlier checks |

Choose a field to load its captured SelectorTree and evaluation. Historical
checks are addressable with `?check=<job UUID>`. The snapshot viewer shows
acquisition metadata. Initial evidence compares stored text or lists of text
with the canonical value and explains first-observation review. Completing a
task updates its status through the Task API. Canonical values and accepted
baselines have their own workflows.

The backend must include the workspace endpoints and Alembic revision
`m103_monitoring_source_history`.

### Review authorization

The unauthenticated Task API is available through Vite's loopback development
proxy. Studio requests use `/backend/tasks/*` and the proxy permits the Task
read routes and same-origin status updates. The production Nginx service serves
Business Studio and rejects `/backend/*` requests until a user authentication
contract is available for the Task module.

In local development, Vite forwards the allowlisted GET requests beneath
`/backend/monitoring` to `/monitoring` at `BURBOT_API_TARGET`. This covers task
reviews, Attention, Source Review, check history, and captured field inspection. Vite reads
`MONITORING_ADMIN_TOKEN` from its server environment and sets the upstream
Bearer header. The browser receives only the Review enabled flag. With an
empty setting, the review page shows how to configure the token. Completing a
task records its workflow status. Canonical values use the Business Layer's
existing workflow.

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
`/api/v1/business/...` and `/backend/tasks/...` as same-origin paths.
Alternatively set `VITE_API_BASE_URL` to a browser-accessible API origin. A
different origin requires backend CORS configuration. This public value is
embedded at build time; rebuild after changing it.

### Local Docker development

Run the backend with its API published on `127.0.0.1:8000`. Then start Studio
using the backend's existing environment file or an exported
`MONITORING_ADMIN_TOKEN`.

```bash
docker compose --env-file ../burbot/.env -f docker-compose.dev.yml up
```

Open `http://localhost:5173/#/monitoring/attention`. The development container uses host networking so Vite
can listen on `127.0.0.1:5173` and reach FastAPI over loopback. On Docker
Desktop, enable host networking. Set `BURBOT_API_TARGET` if FastAPI uses a
different address. Run the Compose command again after changing the token.
For Vite outside Docker, export the token in the shell that runs `npm run dev`.

### Production Docker image

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
npx playwright install chromium
npm run test:ui
```

Unit tests cover draft migration, source reconstruction, default/identity
preservation, completions, Unicode diagnostic columns, object ID mappings,
optimistic update payloads, Task API mapping, Review proxy authorization, and
production bundle isolation.
Browser tests exercise real Studio routes with mocked HTTP, including Monaco
drafts, pagination, status updates, workflow history, source attention, and
historical field inspection.

Against a running local Studio and Burbot database, run the read-only smoke
test. An optional `BURBOT_SMOKE_TASK_ID` identifies an existing task to exercise
the detail and history paths.

```bash
BURBOT_STUDIO_URL=http://127.0.0.1:5173 npm run test:tasks-live
```

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

### Adding resources

Register route metadata with Refine, add the corresponding Data Provider
operations, and load the resource pages lazily under the shared Studio shell.
Source browsing can use the paginated Source API. Keep Monitoring operator
credentials on the server. SelectorTrees should use the versioned extraction
contracts and carry the selected version through editing
and approval. Generate a client from the verified contract for each domain.
