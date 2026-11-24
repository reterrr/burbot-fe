import { expect, test } from '@playwright/test'

const date = '2026-11-24T10:00:00Z'
const pendingActions = ['in_progress', 'completed', 'failed', 'cancelled']
const task = (id, fields = {}) => ({
  id,
  title: `Review task ${id}`,
  workflow_id: 9,
  type: 'review_source_change',
  reason: 'value_changed',
  status: 'pending',
  metadata_json: { evidenceStatus: 'CHANGED' },
  description: 'Verify the latest source evidence.',
  created_at: date,
  started_at: null,
  completed_at: null,
  ...fields,
})
const references = [
  {
    id: 1,
    task_id: 42,
    role: 'target',
    reference_type: 'source',
    reference_id: 7,
    metadata_json: null,
    created_at: date,
  },
  {
    id: 2,
    task_id: 42,
    role: 'context',
    reference_type: 'source_snapshot',
    reference_id: 16,
    metadata_json: null,
    created_at: date,
  },
  {
    id: 3,
    task_id: 42,
    role: 'target',
    reference_type: 'business_field',
    reference_id: 21,
    metadata_json: null,
    created_at: date,
  },
]
const detail = (fields) => ({
  ...task(42, fields),
  allowed_statuses: pendingActions,
  references,
})
const envelope = (record) => ({
  task: record,
  source_id: 7,
  source_snapshot_id: 16,
  workflow_key: 'source_processing',
  allowed_statuses: pendingActions,
})
const paged = (items, total = items.length, offset = 0) => ({
  items,
  total,
  offset,
  limit: 20,
})

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/business/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/models')) return route.fulfill({ json: paged([]) })
    return route.fulfill({ json: paged([]) })
  })
  await page.route('**/backend/tasks/inbox/count', (route) =>
    route.fulfill({ json: 23 }),
  )
})

test('Inbox pages and filters are server queries and survive navigation', async ({
  page,
}) => {
  const requests = []
  await page.route(/\/backend\/tasks\/inbox\?/, (route) => {
    const params = new URL(route.request().url()).searchParams
    requests.push(Object.fromEntries(params))
    const offset = Number(params.get('offset'))
    return route.fulfill({
      json: {
        ...paged([envelope(task(offset ? 42 : 41))], 23, offset),
        applied_filters: params.has('source_id')
          ? { source_id: Number(params.get('source_id')) }
          : {},
      },
    })
  })
  await page.route('**/backend/tasks/42', (route) =>
    route.fulfill({ json: detail() }),
  )
  await page.goto('/#/tasks')
  await expect(page.getByRole('heading', { name: 'Task inbox' })).toBeVisible()
  await expect(page.getByTestId('task-inbox-count')).toHaveText('23')
  await expect(page.getByRole('link', { name: 'Review task 41' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Source ID' }).fill('7')
  await page.getByRole('button', { name: 'Apply filters' }).click()
  await expect
    .poll(() => requests.at(-1))
    .toMatchObject({ offset: '0', limit: '20', source_id: '7' })
  await page.locator('.ant-pagination-item-2').click()
  await expect(page.getByRole('link', { name: 'Review task 42' })).toBeVisible()
  await expect
    .poll(() => requests.at(-1))
    .toMatchObject({ offset: '20', limit: '20', source_id: '7' })
  await page.getByRole('link', { name: 'Review task 42' }).click()
  await expect(
    page.getByRole('heading', { name: 'Review task 42' }),
  ).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('link', { name: 'Review task 42' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Source ID' })).toHaveValue(
    '7',
  )
  await page.goForward()
  await expect(
    page.getByRole('heading', { name: 'Review task 42' }),
  ).toBeVisible()
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'Review task 42' }),
  ).toBeVisible()
  await expect(page.getByText('Source snapshot')).toBeVisible()
})

test('Inbox shows Retry when the backend is unavailable and an empty state after recovery', async ({
  page,
}) => {
  let unavailable = true
  await page.route(/\/backend\/tasks\/inbox\?/, (route) =>
    unavailable
      ? route.fulfill({ status: 503, json: { detail: 'Service unavailable' } })
      : route.fulfill({ json: paged([]) }),
  )
  await page.goto('/#/tasks')
  await expect(page.getByText('Could not load the Inbox')).toBeVisible()
  await expect(page.getByText('Service unavailable')).toBeVisible()
  unavailable = false
  await page.getByRole('button', { name: 'Retry' }).click()
  await expect(page.getByText('No actionable tasks')).toBeVisible()
})

test('status mutations are pessimistic and refresh details and the count', async ({
  page,
}) => {
  let status = 'pending'
  let count = 2
  let reads = 0
  await page.route('**/backend/tasks/inbox/count', (route) =>
    route.fulfill({ json: count }),
  )
  await page.route('**/backend/tasks/42', (route) => {
    reads++
    return route.fulfill({
      json: {
        ...detail({ status }),
        allowed_statuses:
          status === 'completed'
            ? []
            : status === 'in_progress'
              ? ['completed', 'failed', 'cancelled']
              : pendingActions,
      },
    })
  })
  await page.route('**/backend/tasks/42/status', async (route) => {
    expect(route.request().method()).toBe('PATCH')
    const body = route.request().postDataJSON()
    if (status === 'pending') expect(body).toEqual({ status: 'in_progress' })
    else expect(body).toEqual({ status: 'completed' })
    status = body.status
    if (status === 'completed') count = 1
    await route.fulfill({ json: detail({ status }) })
  })
  await page.goto('/#/tasks/42')
  await expect(page.getByTestId('task-inbox-count')).toHaveText('2')
  const initialReads = reads
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.getByText('In progress', { exact: true })).toBeVisible()
  await expect.poll(() => reads).toBeGreaterThan(initialReads)
  await page.getByRole('button', { name: 'Complete', exact: true }).click()
  await expect(
    page.getByRole('dialog', { name: 'Complete task #42?' }),
  ).toBeVisible()
  expect(status).toBe('in_progress')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Complete', exact: true })
    .click()
  await expect(
    page.getByText('Completed', { exact: true }).first(),
  ).toBeVisible()
  await expect(page.getByTestId('task-inbox-count')).toHaveText('1')
  await expect(
    page.getByRole('button', { name: 'Complete', exact: true }),
  ).toHaveCount(0)
})

for (const code of [422, 409]) {
  test(`status errors ${code} are shown without reporting success`, async ({
    page,
  }) => {
    let attempted = false
    const message =
      code === 409
        ? 'Workflow 9 is no longer active'
        : 'Cannot transition task 42 to in_progress'
    await page.route('**/backend/tasks/42', (route) =>
      route.fulfill({
        json:
          code === 409 && attempted
            ? { ...detail({ status: 'cancelled' }), allowed_statuses: [] }
            : detail(),
      }),
    )
    await page.route('**/backend/tasks/42/status', (route) => {
      attempted = true
      return route.fulfill({ status: code, json: { detail: message } })
    })
    await page.goto('/#/tasks/42')
    await page.getByRole('button', { name: 'Start', exact: true }).click()
    await expect(page.getByText(message)).toBeVisible()
    await expect(
      page.getByText(code === 409 ? 'Cancelled' : 'Pending', { exact: true }),
    ).toBeVisible()
    await expect(page.getByText('Task #42 · In progress')).toHaveCount(0)
  })
}

test('review renders evidence and handles missing records and rejected tokens', async ({
  page,
}) => {
  let response = 'CHANGED'
  await page.route('**/backend/tasks/42', (route) =>
    route.fulfill({ json: detail() }),
  )
  await page.route('**/backend/monitoring/reviews/42', (route) => {
    if (response === 'UNAUTHORIZED') return route.fulfill({ status: 401 })
    return response === 'SOURCE_ONLY'
      ? route.fulfill({
          status: 404,
          json: { detail: { code: 'MONITORING_REVIEW_NOT_FOUND' } },
        })
      : route.fulfill({
          json: {
            taskId: 42,
            taskStatus: 'pending',
            businessObjectFieldId: 15,
            canonicalValueId: 6,
            canonicalValue: '01.12.2026',
            previousObservationId: 32,
            observationId: response === 'MISSING' ? null : 33,
            previousEvidence: 'Before\nSecond line',
            currentEvidence:
              response === 'MISSING'
                ? null
                : ['15.12.2026', '<b>Plain text</b>'],
            baselineObservationId: 32,
            evaluationId: 18,
            comparison: 'accepted_baseline',
            evidenceStatus: response,
            evidenceChanged: response === 'CHANGED' ? true : null,
            requiresReview: true,
          },
        })
  })
  await page.goto('/#/tasks/42/review')
  await expect(page.getByText('Changed evidence')).toBeVisible()
  await expect(page.getByText('01.12.2026', { exact: true })).toBeVisible()
  await expect(
    page.getByText('Before Second line', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('<b>Plain text</b>', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByTestId('evidence-comparison').locator('b'),
  ).toHaveCount(0)
  response = 'MISSING'
  await page.reload()
  await expect(page.getByText('Missing evidence')).toBeVisible()
  await expect(page.getByText('No evidence recorded')).toBeVisible()
  response = 'SOURCE_ONLY'
  await page.reload()
  await expect(
    page.getByText(
      'No field-level evidence comparison is available for this task',
    ),
  ).toBeVisible()
  await expect(page.getByText('Source snapshot')).toBeVisible()
  response = 'UNAUTHORIZED'
  await page.reload()
  await expect(
    page.getByText('FastAPI rejected the local operator token'),
  ).toBeVisible()
})

test('Workflow History exposes superseded workflows and their historical tasks', async ({
  page,
}) => {
  const old = {
    id: 8,
    source_id: 7,
    source_snapshot_id: 15,
    key: 'source_processing',
    previous_workflow_id: null,
    status: 'superseded',
    created_at: date,
    completed_at: null,
    superseded_at: date,
    metadata_json: null,
  }
  const active = {
    ...old,
    id: 9,
    source_snapshot_id: 16,
    status: 'active',
    previous_workflow_id: 8,
  }
  await page.route(/\/backend\/tasks\/sources\/7\/workflows\?/, (route) =>
    route.fulfill({ json: paged([active, old]) }),
  )
  await page.route('**/backend/tasks/workflows/8', (route) =>
    route.fulfill({ json: old }),
  )
  await page.route(/\/backend\/tasks\/workflows\/8\/tasks\?/, (route) =>
    route.fulfill({ json: paged([task(39, { status: 'cancelled' })]) }),
  )
  await page.goto('/#/tasks/history?source=7')
  await expect(page.getByText('Superseded', { exact: true })).toBeVisible()
  await expect(page.getByText('Active', { exact: true })).toBeVisible()
  await page
    .getByRole('row')
    .filter({ hasText: 'Superseded' })
    .getByRole('button', { name: '#8' })
    .click()
  await expect(
    page.getByRole('dialog').getByText('Workflow #8', { exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'Review task 39' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('link', { name: 'Review task 39' })).toBeVisible()
})

test('Business routes keep the selected model and its Monaco draft across Task navigation', async ({
  page,
}) => {
  test.setTimeout(60_000)
  const models = [
    {
      id: 1,
      name: 'First model',
      key: 'first',
      metadata_json: null,
      description: null,
      created_at: date,
      updated_at: date,
    },
    {
      id: 2,
      name: 'Second model',
      key: 'second',
      metadata_json: null,
      description: null,
      created_at: date,
      updated_at: date,
    },
  ]
  const draft =
    'class PreservedDraft(Entity):\n    name: String(nullable=False)\n'
  await page.addInitScript(
    (source) => localStorage.setItem('burbot:program-draft:v2:2', source),
    draft,
  )
  await page.route(/\/api\/v1\/business\/models\?/, (route) =>
    route.fulfill({ json: paged(models) }),
  )
  await page.route(/\/api\/v1\/business\/models\/\d+\/schema/, (route) =>
    route.fulfill({ json: { entities: [], enums: [] } }),
  )
  await page.route(/\/backend\/tasks\/inbox\?/, (route) =>
    route.fulfill({ json: paged([]) }),
  )
  await page.goto('/#/models')
  await expect(
    page.getByText('Second model', { exact: true }).first(),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Revisions', exact: true }).click()
  const editor = page.locator('.monaco-editor .view-lines')
  await expect(editor).toBeVisible({ timeout: 20_000 })
  await page.getByRole('combobox', { name: 'Business model' }).selectOption('2')
  await expect(
    page.getByRole('combobox', { name: 'Business model' }),
  ).toHaveValue('2')
  await expect(editor).toContainText('PreservedDraft', { timeout: 20_000 })
  await page.getByRole('link', { name: 'Task inbox', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Task inbox' })).toBeVisible()
  await page
    .getByRole('link', { name: 'Business objects', exact: true })
    .click()
  await expect(page).toHaveURL(/#\/objects$/)
  await page.getByRole('link', { name: 'Revisions', exact: true }).click()
  await expect(
    page.getByRole('combobox', { name: 'Business model' }),
  ).toHaveValue('2')
  await expect(editor).toContainText('PreservedDraft', { timeout: 20_000 })
  expect(
    await page.evaluate(() =>
      localStorage.getItem('burbot:program-draft:v2:2'),
    ),
  ).toBe(draft)
})
