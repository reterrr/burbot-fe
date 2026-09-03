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
npm run dev
```

The client uses same-origin Burbot API routes under `/api`. Point the local or
deployment reverse proxy at the Business Driver backend.

## Checks

```bash
npm run build
npm run lint
```

Regenerate the typed API client after updating `openapi.json`:

```bash
npm run api:generate
```
