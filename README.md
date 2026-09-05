# Burbot Studio

Frontend workspace for creating Burbot business models and registering atomic
schema revisions.

## Current views

- **Business models** — creates a top-level model namespace through the generated
  FastAPI client.
- **Revision studio** — Monaco-based JSON schema editor with an entity outline,
  local drafts, contract diagnostics, schema diff preview, and revision
  registration.

The editable JSON omits `SourceLocation`. The frontend derives those locations
from the document before sending the schema to the API.

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
```

Regenerate the typed API client after updating `openapi.json`:

```bash
npm run api:generate
```
