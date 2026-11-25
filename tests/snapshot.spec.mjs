import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'

const source = {
  id: 57,
  url: 'https://arrkonin.org.pl/',
  name: null,
  state: 'ACTIVE',
}
const date = '2026-11-24T10:00:00Z'
const original = `<!doctype html>\r\n<html lang="pl"><head><title>Archiwum</title></head>
<body><article class="programme highlighted" id="event"><h1>Archiwalne ogłoszenie</h1>
<p>Szkolenie 2026</p></article><aside class="programme"><p>Szkolenie 2026</p></aside>
<script type="application/json">{"saved":true}</script></body></html>\r\n`
const originalBytes = Buffer.from(original)
const sha256 = createHash('sha256').update(originalBytes).digest('hex')
const old = makeSnapshot(15)
const latest = makeSnapshot(16)
const key = (id) => `/monitoring/sources/57/snapshots/${id}`

function makeSnapshot(id) {
  return {
    id,
    source_id: 57,
    page_url: `${source.url}archiwum/${id}`,
    fetched_at: date,
    mime_type: 'text/html',
    content_hash: 'a'.repeat(64),
    structure_hash: 'b'.repeat(64),
    representation: 'rendered_dom',
    representation_version: 'firefox-dom-1',
  }
}

function record(
  snapshot,
  artifact = {
    mimeType: 'text/html',
    sizeBytes: originalBytes.length,
    sha256,
  },
) {
  return { source, snapshot, artifact }
}

async function serveSnapshot(page, snapshot, unavailable = false) {
  await page.route(`**/backend${key(snapshot.id)}/content*`, (route) => {
    const onlyDetails = new URL(route.request().url()).searchParams.has(
      'metadataOnly',
    )
    return route.fulfill({
      json: { ...record(snapshot), html: onlyDetails ? null : original },
    })
  })
  await page.route(`**/backend${key(snapshot.id)}/preview`, (route) =>
    unavailable
      ? route.fulfill({
          status: 422,
          json: { detail: { code: 'SNAPSHOT_INTEGRITY_MISMATCH' } },
        })
      : route.fulfill({
          contentType: 'text/html; charset=utf-8',
          body: `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; form-action 'none'">
<h1>Archiwalne ogłoszenie ${snapshot.id}</h1>
<script>document.documentElement.dataset.scriptRan = 'true'</script>
<img alt="Example external image" src="https://example.invalid/preview.png">`,
        }),
  )
  await page.route(`**/backend${key(snapshot.id)}/download`, (route) =>
    route.fulfill({
      contentType: 'application/octet-stream',
      headers: {
        'content-disposition': `attachment; filename="snapshot-${snapshot.id}.html"`,
      },
      body: originalBytes,
    }),
  )
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/business/**', (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  await page.route('**/backend/tasks/inbox/count', (route) =>
    route.fulfill({ json: 0 }),
  )
})

const bridgeAgent = {
  agentId: '00000000-0000-4000-8000-000000000057',
  name: 'Firefox Studio workstation',
}
const alternateAgent = {
  agentId: '00000000-0000-4000-8000-000000000058',
  name: 'Firefox laptop',
}
const commandPath = '**/backend/monitoring/snapshots/open-commands'
const expiresAt = '2099-11-24T10:01:30Z'

test('Snapshot #386 opens only on agent acknowledgement and keeps the Preview and HTML Source', async ({
  page,
}) => {
  const historical = makeSnapshot(386)
  await serveSnapshot(page, historical)
  const commands = []
  let state = 'pending'
  await page.route(
    '**/backend/monitoring/sources/57/snapshot-agents',
    (route) => route.fulfill({ json: [bridgeAgent, alternateAgent] }),
  )
  await page.route(commandPath, (route) => {
    const request = route.request().postDataJSON()
    commands.push(request)
    return route.fulfill({
      json: {
        commandId: request.requestId,
        state: 'pending',
        expiresAt,
        errorCode: null,
      },
    })
  })
  await page.route(`${commandPath}/*`, (route) =>
    route.fulfill({
      json: {
        commandId: commands[0].requestId,
        state,
        expiresAt,
        errorCode: null,
      },
    }),
  )
  await page.goto(`/#${key(386)}`)
  await page
    .getByRole('button', { name: 'Open in Firefox', exact: true })
    .click()
  const dialog = page.getByRole('dialog', {
    name: 'Open Snapshot #386 in Firefox',
  })
  await dialog.getByRole('combobox', { name: 'Firefox agent' }).click()
  await page.getByRole('option', { name: alternateAgent.name }).click()
  expect(commands).toHaveLength(0)
  await dialog.getByRole('button', { name: 'Send command' }).click()
  await expect(
    dialog.getByText('Waiting for Firefox to receive the command…'),
  ).toBeVisible()
  expect(commands).toHaveLength(1)
  expect(commands[0]).toMatchObject({
    action: 'open_snapshot',
    sourceId: 57,
    snapshotId: 386,
    targetAgentId: alternateAgent.agentId,
  })
  await expect(
    dialog.getByText('Opened in Firefox', { exact: true }),
  ).toHaveCount(0)
  state = 'claimed'
  await expect(
    dialog.getByText('Firefox is opening the snapshot…'),
  ).toBeVisible()
  await expect(
    dialog.getByText('Opened in Firefox', { exact: true }),
  ).toHaveCount(0)
  state = 'opened'
  await expect(
    dialog.getByText('Opened in Firefox', { exact: true }),
  ).toBeVisible()
  await dialog.getByRole('button', { name: 'Close' }).click()
  await expect(
    page
      .frameLocator('iframe[title="Snapshot preview"]')
      .getByRole('heading', { name: 'Archiwalne ogłoszenie 386' }),
  ).toBeVisible()
  await page.getByRole('tab', { name: 'HTML Source' }).click()
  await expect(page.locator('.monaco-editor .view-lines')).toContainText(
    'Archiwalne ogłoszenie',
    { timeout: 20_000 },
  )
})

test('offline, unavailable, and expired Firefox attempts have distinct feedback', async ({
  page,
}) => {
  await serveSnapshot(page, old)
  let connected = false
  let invalid = true
  await page.route(
    '**/backend/monitoring/sources/57/snapshot-agents',
    (route) => route.fulfill({ json: connected ? [bridgeAgent] : [] }),
  )
  await page.route(commandPath, (route) =>
    invalid
      ? route.fulfill({
          status: 404,
          json: { detail: { code: 'SNAPSHOT_ARTIFACT_NOT_FOUND' } },
        })
      : route.fulfill({
          json: {
            commandId: route.request().postDataJSON().requestId,
            state: 'pending',
            expiresAt,
            errorCode: null,
          },
        }),
  )
  await page.route(`${commandPath}/*`, (route) =>
    route.fulfill({ json: { state: 'expired', expiresAt, errorCode: null } }),
  )
  await page.goto(`/#${key(old.id)}`)
  await page
    .getByRole('button', { name: 'Open in Firefox', exact: true })
    .click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Firefox extension offline')).toBeVisible()
  connected = true
  await dialog
    .getByRole('button', { name: 'Find Firefox agents again' })
    .click()
  await expect(
    dialog.getByText('The stored HTML file is unavailable.'),
  ).toBeVisible()
  invalid = false
  await dialog.getByRole('button', { name: 'Retry delivery' }).click()
  await expect(dialog.getByText('The snapshot command expired')).toBeVisible()
  await expect(
    dialog.getByText('Opened in Firefox', { exact: true }),
  ).toHaveCount(0)
})

test('Source #57 deep link opens isolated preview, searchable source, details and exact download', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const external = []
  await page.route('https://example.invalid/**', (route) => {
    external.push(route.request().url())
    return route.abort()
  })
  await serveSnapshot(page, old)
  await page.goto(`/#${key(old.id)}`)
  await expect(
    page.getByRole('heading', { name: 'Snapshot #15' }),
  ).toBeVisible()
  const frame = page.locator('iframe[title="Snapshot preview"]')
  await expect(frame).toHaveAttribute('sandbox', '')
  const view = page.frameLocator('iframe[title="Snapshot preview"]')
  await expect(
    view.getByRole('heading', { name: 'Archiwalne ogłoszenie 15' }),
  ).toBeVisible()
  await expect(view.locator('html')).not.toHaveAttribute(
    'data-script-ran',
    'true',
  )
  expect(await frame.evaluate((iframe) => iframe.contentDocument)).toBeNull()

  await page.getByRole('tab', { name: 'HTML Source' }).click()
  await expect(page.locator('.monaco-editor .view-lines')).toContainText(
    'Archiwalne ogłoszenie',
    { timeout: 20000 },
  )
  await expect(page.locator('.monaco-editor .view-lines')).toContainText(
    '<script',
  )
  await expect(
    page.getByRole('heading', { name: 'Archiwalne ogłoszenie', exact: true }),
  ).toHaveCount(0)
  const search = page.getByRole('textbox', { name: 'Search saved HTML' })
  await search.fill('Szkolenie 2026')
  await expect(page.getByText('1 of 2 matches', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Next match', exact: true }).click()
  await expect(page.getByText('2 of 2 matches', { exact: true })).toBeVisible()
  await page
    .getByRole('button', { name: 'Copy selected HTML', exact: true })
    .click()
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe('Szkolenie 2026')

  const mode = page.getByRole('combobox', { name: 'Search HTML by' })
  await mode.press('ArrowDown')
  await page.getByRole('option', { name: 'CSS class' }).click()
  await search.fill('.programme')
  await expect(page.getByText('1 of 2 matches', { exact: true })).toBeVisible()
  await mode.press('ArrowDown')
  await page.getByRole('option', { name: 'HTML ID' }).click()
  await search.fill('#event')
  await expect(page.getByText('1 of 1 match', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Copy HTML', exact: true }).click()
  await expect
    .poll(async () => {
      const copied = await page.evaluate(() => navigator.clipboard.readText())
      return copied.replaceAll('\r\n', '\n')
    })
    .toBe(original.replaceAll('\r\n', '\n'))

  await page.getByRole('tab', { name: 'Details' }).click()
  for (const value of [
    source.url,
    old.page_url,
    'firefox-dom-1',
    sha256,
    old.content_hash,
    old.structure_hash,
  ])
    await expect(page.getByText(value, { exact: true })).toBeVisible()
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download original HTML' }).click()
  const file = await downloaded
  expect(file.suggestedFilename()).toBe('snapshot-15.html')
  expect(await readFile(await file.path())).toEqual(originalBytes)
  expect(external).toEqual([])
})

test('Source Review, Monitoring History and Field Inspector use the recorded snapshot and return context', async ({
  page,
}) => {
  const uuid = (last) => `00000000-0000-4000-8000-00000000000${last}`
  const check = (id, snapshot) => ({
    id: uuid(id),
    status: 'completed',
    checkedAt: date,
    snapshotId: snapshot.id,
    changeStatus: 'UNCHANGED',
    errorCode: null,
  })
  const latestCheck = check(3, latest)
  const reused = check(2, old)
  const oldest = check(1, old)
  const field = {
    selectorUuid: uuid(4),
    configured: true,
    businessField: { id: 7, name: 'Deadline' },
    status: 'FIELD_CHANGED',
    canonicalValue: '2026-12-01',
    canonicalValueId: 10,
    previousEvidence: '1 December',
    currentEvidence: '2 December',
  }
  await page.route('**/backend/monitoring/sources/57/review?*', (route) => {
    const historical = new URL(route.request().url()).searchParams.has(
      'checkId',
    )
    return route.fulfill({
      json: {
        id: source.id,
        source,
        latestCheck,
        latestCompletedCheck: latestCheck,
        selectedCheck: historical ? reused : latestCheck,
        snapshot: historical ? old : latest,
        fields: [field],
        earlierTasks: { items: [], total: 0, offset: 0, limit: 20 },
      },
    })
  })
  await page.route(
    '**/backend/monitoring/sources/57/history?summary=true*',
    (route) => route.fulfill({ json: [latestCheck, reused, oldest] }),
  )
  await page.route(
    `**/backend/monitoring/sources/57/review/${reused.id}/${field.selectorUuid}`,
    (route) => route.fulfill({ json: { selector: null, evaluation: null } }),
  )
  await serveSnapshot(page, old)
  await page.goto('/#/monitoring/sources/57')
  await expect(
    page.getByRole('link', { name: 'View snapshot' }),
  ).toHaveAttribute('href', `#${key(latest.id)}`)

  await page.getByRole('button', { name: 'Monitoring history' }).click()
  const history = page.getByRole('dialog', { name: 'Monitoring history' })
  const snapshots = history.getByRole('link', { name: 'View snapshot' })
  await expect(snapshots.nth(2)).toHaveAttribute('href', `#${key(old.id)}`)
  await snapshots.nth(1).click()
  await expect(
    page.getByRole('heading', { name: 'Snapshot #15' }),
  ).toBeVisible()
  await page
    .getByRole('link', { name: 'Monitoring history', exact: true })
    .click()
  await expect(history).toBeVisible()
  await history.getByRole('button', { name: 'Review check' }).nth(1).click()
  await expect(page).toHaveURL(new RegExp(`\\?check=${reused.id}$`))
  await expect(
    page.getByRole('link', { name: 'View snapshot' }),
  ).toHaveAttribute('href', `#${key(old.id)}`)

  await page.getByRole('button', { name: 'Deadline', exact: true }).click()
  const inspector = page.getByRole('dialog', { name: 'Deadline' })
  await inspector.getByRole('link', { name: 'View snapshot' }).click()
  await expect(
    page.getByRole('heading', { name: 'Snapshot #15' }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Field inspector', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`\\?check=${reused.id}$`))
  await expect(inspector).toBeVisible()
})

test('Task Details and Evidence Review link the task capture and keep details on artifact errors', async ({
  page,
}) => {
  const task = {
    id: 100,
    title: 'Review archived evidence',
    workflow_id: 5,
    type: 'review_source_change',
    status: 'pending',
    created_at: date,
    metadata_json: { monitoringJobId: 'captured-check' },
    allowed_statuses: ['completed'],
    references: [
      { id: 1, role: 'context', reference_type: 'source', reference_id: 57 },
      {
        id: 2,
        role: 'context',
        reference_type: 'source_snapshot',
        reference_id: old.id,
      },
    ],
  }
  await page.route('**/backend/tasks/100', (route) =>
    route.fulfill({ json: task }),
  )
  await page.route('**/backend/monitoring/reviews/100', (route) =>
    route.fulfill({
      json: {
        taskId: task.id,
        taskStatus: task.status,
        source,
        snapshot: old,
        requiresReview: true,
        currentEvidence: '2 December',
        previousEvidence: '1 December',
        canonicalValue: null,
      },
    }),
  )
  await serveSnapshot(page, old, true)
  await page.goto('/#/tasks/100')
  await page.getByRole('link', { name: 'View snapshot' }).click()
  await expect(
    page.getByText('The stored HTML failed its integrity check.'),
  ).toBeVisible()
  await page.getByRole('tab', { name: 'Details' }).click()
  await expect(page.getByText(old.page_url, { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Task details', exact: true }).click()
  await page.getByRole('link', { name: 'Open evidence review' }).click()
  await expect(
    page.getByRole('heading', { name: 'Evidence review', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'View snapshot' }),
  ).toHaveAttribute('href', `#${key(old.id)}`)
  await page.getByRole('link', { name: 'View snapshot' }).click()
  await page.getByRole('link', { name: 'Evidence review', exact: true }).click()
  await expect(page).toHaveURL(/#\/tasks\/100\/review$/)
})
