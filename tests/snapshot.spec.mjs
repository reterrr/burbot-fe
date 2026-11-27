import { expect, test } from '@playwright/test'

const source = {
  id: 541,
  url: 'https://arrkonin.org.pl/',
  name: null,
  state: 'ACTIVE',
}
const sourcePath = `/monitoring/sources/${source.id}`
const date = '2026-11-24T10:00:00Z'
const uuid = (id) =>
  `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`
const latest = { id: 578, source_id: source.id, fetched_at: date }
const old = { ...latest, id: 577 }
const check = (id, snapshot) => ({
  id: uuid(id),
  status: 'completed',
  checkedAt: date,
  snapshotId: snapshot.id,
  changeStatus: 'UNCHANGED',
  errorCode: null,
})
const latestCheck = check(3, latest)
const historicalCheck = check(2, old)
const reusedCheck = check(1, old)
const selector = {
  identity: { uuid: uuid(4), target: { objectId: '7', field: 'Deadline' } },
  version: { uuid: uuid(5), versionNo: 1, status: 'superseded', recipes: [] },
}
const extractionRunId = 35
const selectorContext = {
  extractionRunId,
  selectorUuid: selector.identity.uuid,
  selectorVersionUuid: selector.version.uuid,
}
const field = {
  selectorUuid: selector.identity.uuid,
  configured: true,
  businessField: { id: 7, name: 'Deadline' },
  status: 'FIELD_CHANGED',
  canonicalValue: '2026-12-01',
  canonicalValueId: 10,
  previousEvidence: '1 December',
  currentEvidence: '2 December',
}

const agent = { agentId: uuid(57), name: 'Firefox Studio workstation' }
const otherAgent = { agentId: uuid(58), name: 'Firefox laptop' }
const commandPath = '**/backend/monitoring/snapshots/open-commands'
const expiresAt = '2099-11-24T10:01:30Z'

function command(commandId, state, errorCode = null) {
  return { commandId, state, expiresAt, errorCode }
}

async function mockBridge(
  page,
  {
    agents = () => [agent],
    create = (route, { requestId }) =>
      route.fulfill({ json: command(requestId, 'pending') }),
    status = (route, id) => route.fulfill({ json: command(id, 'opened') }),
  } = {},
) {
  const posts = []
  const statusReads = []
  let agentReads = 0
  await page.route(`**/backend${sourcePath}/snapshot-agents`, (route) => {
    agentReads++
    return route.fulfill({ json: agents() })
  })
  await page.route(commandPath, (route) => {
    expect(route.request().method()).toBe('POST')
    expect(route.request().headers()).not.toHaveProperty('authorization')
    const body = route.request().postDataJSON()
    posts.push(body)
    return create(route, body)
  })
  await page.route(`${commandPath}/*`, (route) => {
    const id = new URL(route.request().url()).pathname.split('/').at(-1)
    statusReads.push(id)
    return status(route, id)
  })
  return { posts, statusReads, agentReads: () => agentReads }
}

async function mockSourceReview(page) {
  await page.route(`**/backend${sourcePath}/review?*`, (route) => {
    const checkId = new URL(route.request().url()).searchParams.get('checkId')
    return route.fulfill({
      json: {
        id: source.id,
        source,
        latestCheck,
        latestCompletedCheck: latestCheck,
        selectedCheck: checkId ? historicalCheck : latestCheck,
        snapshot: checkId ? old : latest,
        fields: [field],
        earlierTasks: { items: [], total: 0, offset: 0, limit: 20 },
      },
    })
  })
}

function openSnapshot(scope, snapshot = latest) {
  return scope.getByRole('button', {
    name: `Open snapshot #${snapshot.id}`,
    exact: true,
  })
}

function opened(scope) {
  return scope.getByText('Opened in Firefox', { exact: true })
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/business/**', (route) =>
    route.fulfill({ json: { items: [], total: 0 } }),
  )
  await page.route('**/backend/tasks/inbox/count', (route) =>
    route.fulfill({ json: 0 }),
  )
})

test('Source #541 sends snapshot #578 to one agent and waits for acknowledgement', async ({
  page,
}) => {
  await mockSourceReview(page)
  const artifactRequests = []
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname
    if (path.startsWith(`/backend${sourcePath}/snapshots/`))
      artifactRequests.push(request.url())
  })
  let state = 'pending'
  const bridge = await mockBridge(page, {
    status: (route, id) => route.fulfill({ json: command(id, state) }),
  })
  await page.goto(`/#${sourcePath}`)
  const button = openSnapshot(page)
  await expect(button).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Open original website' }),
  ).toHaveAttribute('href', source.url)
  expect(bridge.agentReads()).toBe(0)
  await button.click()
  await expect(
    page.getByText('Waiting for Firefox to receive the command…'),
  ).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(bridge.agentReads()).toBe(1)
  expect(bridge.posts).toEqual([
    {
      action: 'open_snapshot',
      requestId: expect.any(String),
      sourceId: 541,
      snapshotId: 578,
      checkId: latestCheck.id,
      targetAgentId: agent.agentId,
    },
  ])
  await expect(opened(page)).toHaveCount(0)
  state = 'claimed'
  await expect(page.getByText('Firefox is opening the snapshot…')).toBeVisible()
  await expect(opened(page)).toHaveCount(0)
  state = 'opened'
  await expect(opened(page)).toBeVisible()
  await expect(page).toHaveURL(`/#${sourcePath}`)
  await expect(page.locator('iframe')).toHaveCount(0)
  expect(artifactRequests).toEqual([])
})

test('with more than one agent the user chooses who receives the command', async ({
  page,
}) => {
  await mockSourceReview(page)
  const bridge = await mockBridge(page, { agents: () => [agent, otherAgent] })
  await page.goto(`/#${sourcePath}`)
  await openSnapshot(page).click()
  const chooser = page.getByRole('dialog', { name: /Choose a Firefox agent/ })
  const send = chooser.getByRole('button', { name: 'Send command' })
  await expect(send).toBeDisabled()
  expect(bridge.posts).toEqual([])
  await chooser.getByRole('combobox', { name: 'Firefox agent' }).click()
  await page.getByRole('option', { name: otherAgent.name }).click()
  expect(bridge.posts).toEqual([])
  await send.click()
  await expect(chooser).toBeHidden()
  await expect(opened(page)).toBeVisible()
  expect(bridge.posts).toEqual([
    expect.objectContaining({
      sourceId: source.id,
      snapshotId: latest.id,
      targetAgentId: otherAgent.agentId,
    }),
  ])
})

test('offline, failed, and expired commands show feedback and can be retried', async ({
  page,
}) => {
  await mockSourceReview(page)
  let agents = []
  let state = 'failed'
  let errorCode = 'SNAPSHOT_INTEGRITY_MISMATCH'
  const bridge = await mockBridge(page, {
    agents: () => agents,
    status: (route, id) => route.fulfill({ json: command(id, state, errorCode) }),
  })
  await page.goto(`/#${sourcePath}`)
  const button = openSnapshot(page)
  await button.click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Firefox extension offline' }),
  ).toBeVisible()
  expect(bridge.posts).toEqual([])
  agents = [agent]
  await button.click()
  await expect(
    page.getByText('The stored HTML failed its integrity check.'),
  ).toBeVisible()
  await expect(opened(page)).toHaveCount(0)
  state = 'expired'
  errorCode = null
  await button.click()
  await expect(page.getByText(/The snapshot command expired/)).toBeVisible()
  await expect(opened(page)).toHaveCount(0)
  state = 'opened'
  await button.click()
  await expect(opened(page)).toBeVisible()
  expect(bridge.posts).toHaveLength(3)
  expect(new Set(bridge.posts.map(({ requestId }) => requestId)).size).toBe(3)
})

test('delivery and status timeouts can be retried without sending another command', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const timeout = AbortSignal.timeout
    AbortSignal.timeout = (ms) => timeout(ms === 12_000 ? 500 : ms)
  })
  await mockSourceReview(page)
  let createAttempts = 0
  let statusAttempts = 0
  const bridge = await mockBridge(page, {
    create(route, { requestId }) {
      if (++createAttempts === 1) return // Simulate a queued command with a lost response.
      return route.fulfill({ json: command(requestId, 'pending') })
    },
    status(route, id) {
      if (++statusAttempts === 1) return
      return route.fulfill({ json: command(id, 'opened') })
    },
  })
  await page.goto(`/#${sourcePath}`)
  const button = openSnapshot(page)
  await button.click()
  await expect(page.getByText(/Could not send.*timed out/)).toBeVisible()
  await button.click()
  await expect(
    page.getByText(/Could not check snapshot delivery.*timed out/),
  ).toBeVisible()
  await expect(opened(page)).toHaveCount(0)
  await page.getByRole('button', { name: 'Retry status' }).click()
  await expect(opened(page)).toBeVisible()
  expect(bridge.agentReads()).toBe(1)
  expect(bridge.posts).toHaveLength(2)
  expect(bridge.posts[1]).toEqual(bridge.posts[0])
  expect(bridge.statusReads).toEqual(Array(2).fill(bridge.posts[0].requestId))
})

test('legacy snapshot links land on Source Review without opening or fetching a snapshot', async ({
  page,
}) => {
  await mockSourceReview(page)
  const traffic = []
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname
    if (path.startsWith('/backend/') && /snapshots\/|snapshot-agents/.test(path))
      traffic.push(path)
  })
  await page.goto(`/#${sourcePath}/snapshots/${old.id}`)
  await expect(page).toHaveURL(`/#${sourcePath}`)
  await expect(openSnapshot(page)).toBeVisible()
  await expect(page.locator('iframe')).toHaveCount(0)
  expect(traffic).toEqual([])
  expect(page.context().pages()).toHaveLength(1)

  await page.route('**/backend/monitoring/attention/sources?*', (route) =>
    route.fulfill({ json: { items: [], total: 0, offset: 0, limit: 20 } }),
  )
  await page.goto('/#/monitoring/sources/invalid/snapshots/577')
  await expect(page).toHaveURL('/#/monitoring/sources')
  expect(traffic).toEqual([])
})

test('Monitoring History and Field Inspector keep the selected capture and review open', async ({
  page,
}) => {
  await mockSourceReview(page)
  await page.route(`**/backend${sourcePath}/history?summary=true*`, (route) =>
    route.fulfill({ json: [latestCheck, historicalCheck, reusedCheck] }),
  )
  await page.route(
    `**/backend${sourcePath}/review/${historicalCheck.id}/${field.selectorUuid}`,
    (route) =>
      route.fulfill({ json: { selector, evaluation: null, extractionRunId } }),
  )
  const bridge = await mockBridge(page)
  await page.goto(`/#${sourcePath}`)
  await page.getByRole('button', { name: 'Monitoring history' }).click()
  const history = page.getByRole('dialog', { name: 'Monitoring history' })
  const snapshots = openSnapshot(history, old)
  await expect(snapshots).toHaveCount(2)
  await snapshots.first().click()
  await expect(opened(history)).toBeVisible()
  await expect(page).toHaveURL(`/#${sourcePath}`)
  expect(bridge.posts[0]).toMatchObject({
    sourceId: source.id,
    snapshotId: old.id,
  })
  expect(bridge.posts[0]).not.toHaveProperty('selectorContext')
  await history.getByRole('button', { name: 'Review check' }).nth(1).click()
  const historicalPath = `/#${sourcePath}?check=${historicalCheck.id}`
  await expect(page).toHaveURL(historicalPath)
  await expect(openSnapshot(page, old)).toBeVisible()

  await page.getByRole('button', { name: 'Deadline', exact: true }).click()
  const inspector = page.getByRole('dialog', { name: 'Deadline' })
  await openSnapshot(inspector, old).click()
  await expect(opened(inspector)).toBeVisible()
  await expect(page).toHaveURL(historicalPath)
  expect(bridge.posts).toHaveLength(2)
  expect(bridge.posts[1]).toMatchObject({
    sourceId: source.id,
    snapshotId: old.id,
    selectorContext,
  })
})

test('archive status and Firefox delivery follow the selected check on a reused snapshot', async ({
  page,
}) => {
  const checks = new Map([
    [latestCheck.id, { ...latestCheck, archive: { mode: 'minimal', status: 'minimal' } }],
    [
      historicalCheck.id,
      {
        ...historicalCheck,
        snapshotId: latest.id,
        archive: { mode: 'full', status: 'partial', captured: 7, missing: 2, truncated: 1 },
      },
    ],
    [
      reusedCheck.id,
      {
        ...reusedCheck,
        snapshotId: latest.id,
        archive: { mode: 'full', status: 'failed', failure: 'upload_failed' },
      },
    ],
  ])
  await page.route('**/backend' + sourcePath + '/review?*', (route) => {
    const id = new URL(route.request().url()).searchParams.get('checkId') ?? latestCheck.id
    return route.fulfill({
      json: {
        id: source.id,
        source,
        latestCheck: checks.get(latestCheck.id),
        latestCompletedCheck: checks.get(latestCheck.id),
        selectedCheck: checks.get(id),
        snapshot: latest,
        fields: [field],
        earlierTasks: { items: [], total: 0, offset: 0, limit: 20 },
      },
    })
  })
  const bridge = await mockBridge(page)
  await page.goto('/#' + sourcePath)
  await expect(page.getByText('Minimal evidence')).toBeVisible()
  await openSnapshot(page).click()
  await expect(opened(page)).toBeVisible()
  await page.goto('/#' + sourcePath + '?check=' + historicalCheck.id)
  await expect(page.getByText('Partial full archive')).toBeVisible()
  await expect(page.getByText('7 captured · 2 missing · 1 truncated')).toBeVisible()
  await openSnapshot(page).click()
  await expect(opened(page)).toBeVisible()
  expect(bridge.posts.map(({ checkId, snapshotId }) => [checkId, snapshotId])).toEqual([
    [latestCheck.id, latest.id], [historicalCheck.id, latest.id],
  ])
  await page.goto('/#' + sourcePath + '?check=' + reusedCheck.id)
  await expect(page.getByText('Full archive unavailable')).toBeVisible()
  await expect(page.getByText('Archive upload failed.')).toBeVisible()
  await expect(openSnapshot(page)).toBeVisible()
})

test('Task Details and Evidence Review send the recorded selector context', async ({
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
      {
        id: 1,
        role: 'context',
        reference_type: 'source',
        reference_id: source.id,
      },
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
        selector,
        extractionRunId,
      },
    }),
  )
  const bridge = await mockBridge(page)
  await page.goto('/#/tasks/100')
  await openSnapshot(page, old).click()
  await expect(opened(page)).toBeVisible()
  await expect(page).toHaveURL('/#/tasks/100')
  await page.getByRole('link', { name: 'Open evidence review' }).click()
  await expect(
    page.getByRole('heading', { name: 'Evidence review', exact: true }),
  ).toBeVisible()
  await openSnapshot(page, old).click()
  await expect(opened(page)).toBeVisible()
  await expect(page).toHaveURL('/#/tasks/100/review')
  expect(bridge.posts).toEqual(
    Array(2).fill(
      expect.objectContaining({
        sourceId: source.id,
        snapshotId: old.id,
        selectorContext,
      }),
    ),
  )
})
