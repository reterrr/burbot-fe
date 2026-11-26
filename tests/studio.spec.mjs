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
  await page.goto('/#/tasks/all')
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
  await page.goto('/#/tasks/all')
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
  await expect(
    page.getByText('Selector version unavailable for this capture'),
  ).toBeVisible()
  await expect(
    page.getByText('Diagnostics unavailable for this capture'),
  ).toBeVisible()
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

test('reference evidence shows readable task references and requires semantic validation', async ({
  page,
}) => {
  const projectName = 'Regional Programme – development services 2024–2029'
  const sourceUrl = 'https://programmes.example.org/register'
  const taskId = 155
  const taskReferences = [
    ['source', 572],
    ['source_snapshot', 268],
    ['extraction_run', 71],
    ['observation', 150],
    ['business_field', 271],
    ['business_object_field', 8608],
    ['business_entity', 999],
  ].map(([reference_type, reference_id], i) => ({
    id: i + 1,
    task_id: taskId,
    role: 'context',
    reference_type,
    reference_id,
    metadata_json: null,
    created_at: date,
  }))
  const record = {
    ...task(taskId, { metadata_json: { monitoringJobId: 'recorded-job' } }),
    references: taskReferences,
    allowed_statuses: pendingActions,
  }
  await page.route(`**/backend/tasks/${taskId}`, (route) =>
    route.fulfill({ json: record }),
  )
  await page.route(`**/backend/monitoring/reviews/${taskId}`, (route) =>
    route.fulfill({
      json: {
        taskId,
        taskStatus: 'pending',
        businessField: {
          id: 271,
          name: 'Projekt',
          persistentKey: 'project_id',
          type: 'reference',
          referenceEntity: { id: 68, name: 'Project' },
        },
        businessObject: { id: 8, name: 'Funding notice' },
        businessObjectFieldId: 8608,
        canonicalValueId: 3639,
        canonicalValue: 291,
        canonicalDisplay: {
          kind: 'reference',
          rawValue: 291,
          label: projectName,
          target: { type: 'business_object', id: 291, entityId: 68 },
          resolved: true,
          labelIsCurrent: true,
        },
        canonicalValueScope: 'current',
        currentEvidence: projectName,
        observationId: 150,
        previousObservationId: null,
        previousEvidence: null,
        extractionRunId: 71,
        extractionRunStatus: 'completed',
        source: { id: 572, url: sourceUrl },
        snapshot: {
          id: 268,
          source_id: 572,
          fetched_at: date,
          page_url: sourceUrl,
        },
        comparison: null,
        evidenceStatus: 'INITIAL_EVIDENCE',
        evidenceChanged: null,
        requiresReview: true,
      },
    }),
  )
  await page.goto(`/#/tasks/${taskId}`)
  const list = page.locator('.task-references')
  await expect(
    list.getByRole('link', { name: 'programmes.example.org' }),
  ).toHaveAttribute('href', '#/tasks/history?source=572')
  await expect(list.getByText('Captured', { exact: false })).toContainText(
    'Nov',
  )
  await expect(list.getByText('Completed', { exact: true })).toBeVisible()
  await expect(list.getByText(projectName, { exact: true })).toBeVisible()
  await expect(
    list.getByText('Projekt · Funding notice', { exact: true }),
  ).toBeVisible()
  await expect(list.getByText('#999', { exact: true })).toBeVisible()

  await page.getByRole('link', { name: 'Open evidence review' }).click()
  const evidence = page.getByTestId('evidence-comparison')
  await expect(
    evidence.getByText('reference → Project', { exact: true }),
  ).toBeVisible()
  await expect(
    evidence.getByText('project_id ·', { exact: true }),
  ).toBeVisible()
  await expect(evidence.getByText('Source #572', { exact: true })).toBeVisible()
  await expect(evidence.getByText('Slot #8608', { exact: true })).toBeVisible()
  await expect(evidence.getByText('Value record #3639')).toBeVisible()
  await expect(evidence.getByText('BusinessObject #291')).toBeVisible()
  await expect(evidence.getByText(projectName, { exact: true })).toHaveCount(2)
  await expect(
    evidence.getByText(
      'Reference target resolved. Evidence requires semantic validation.',
    ),
  ).toBeVisible()
  await expect(
    evidence.getByText('Recorded evidence matches', { exact: false }),
  ).toHaveCount(0)
  await expect(
    evidence.getByRole('button', { name: 'Copy ID' }).first(),
  ).toBeVisible()
})

test('review inspects the captured selector, match counts, and snapshot without writing', async ({
  page,
  context,
}) => {
  const uuid = (id) => `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`
  const sourceUrl = 'https://example.org/projects'
  const pageUrl = sourceUrl + '#captured'
  const firstPart = {
    uuid: uuid(4),
    order: 0,
    extraction: { type: 'text' },
    locators: [
      { uuid: uuid(5), order: 0, kind: 'css_path', selector: '#deadline' },
      {
        uuid: uuid(6),
        order: 1,
        kind: 'xpath',
        expression: '//p[@class="deadline"]',
      },
      {
        uuid: uuid(7),
        order: 2,
        kind: 'text_quote',
        quote: { exact: 'Applications close' },
      },
    ],
  }
  const secondPart = {
    uuid: uuid(9),
    order: 0,
    extraction: { type: 'attribute', name: 'title' },
    locators: [
      {
        uuid: uuid(10),
        order: 0,
        kind: 'element_id',
        elementId: 'applications',
      },
    ],
  }
  const reviewMethods = []
  await page.route('**/backend/tasks/42', (route) =>
    route.fulfill({ json: detail() }),
  )
  await page.route('**/backend/monitoring/reviews/42', (route) => {
    reviewMethods.push(route.request().method())
    return route.fulfill({
      json: {
        taskId: 42,
        taskStatus: 'pending',
        canonicalValueId: 6,
        canonicalValue: '01.12.2026',
        previousEvidence: 'Previously recorded',
        currentEvidence: null,
        evidenceStatus: 'AMBIGUOUS',
        evidenceChanged: null,
        requiresReview: true,
        evaluationId: 18,
        extractionRunId: 24,
        source: { id: 7, url: sourceUrl },
        snapshot: {
          id: 16,
          source_id: 7,
          page_url: pageUrl,
          fetched_at: date,
          mime_type: 'text/html',
          representation: 'rendered_dom',
          representation_version: 'firefox-dom-1',
        },
        selector: {
          identity: {
            uuid: uuid(1),
            target: { objectId: 'project', field: 'deadline' },
            createdAt: date,
          },
          versionId: 12,
          version: {
            uuid: uuid(2),
            selectorUuid: uuid(1),
            versionNo: 3,
            status: 'superseded',
            createdAt: date,
            recipes: [
              { uuid: uuid(3), order: 0, parts: [firstPart] },
              { uuid: uuid(8), order: 1, parts: [secondPart] },
            ],
          },
        },
        evaluation: {
          uuid: uuid(11),
          pageUrl,
          evaluatedAt: date,
          sourceSnapshotId: 16,
          extractionRunId: 24,
          provenance: 'browser_agent_reported',
          result: {
            status: 'ambiguous',
            selectorVersionUuid: uuid(2),
            recipeResults: [
              {
                recipeUuid: uuid(3),
                status: 'ambiguous',
                partResults: [
                  {
                    partUuid: firstPart.uuid,
                    status: 'ambiguous',
                    locatorResults: [
                      {
                        locatorUuid: uuid(5),
                        status: 'not_found',
                        matchCount: 0,
                      },
                      {
                        locatorUuid: uuid(6),
                        status: 'ambiguous',
                        matchCount: 3,
                      },
                    ],
                  },
                ],
              },
              {
                recipeUuid: uuid(8),
                status: 'success',
                rawValue: '<b>Recorded literal</b>',
                partResults: [],
              },
            ],
          },
        },
      },
    })
  })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/#/tasks/42/review')
  await expect(page.getByText('No evidence recorded')).toBeVisible()
  const selector = page.getByRole('region', { name: 'Selector', exact: true })
  await expect(selector.getByText('Version 3', { exact: true })).toBeVisible()
  await expect(selector.getByText('Superseded', { exact: true })).toBeVisible()
  await selector.getByRole('button', { name: 'Copy selector UUID' }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    uuid(1),
  )
  const diagnostics = page.getByRole('region', {
    name: 'Execution diagnostics',
  })
  await expect(diagnostics.getByText('Browser agent reported')).toBeVisible()
  await diagnostics.getByRole('button', { name: /Recipe 1/ }).click()
  await diagnostics.getByRole('button', { name: /Part 1/ }).click()
  await expect(
    diagnostics.getByText('0 matches · No element found'),
  ).toBeVisible()
  await expect(
    diagnostics.getByText('3 matches · Multiple candidates'),
  ).toBeVisible()
  await expect(
    diagnostics.getByText('Diagnostics unavailable', { exact: true }),
  ).toBeVisible()
  await diagnostics.getByRole('button', { name: /Recipe 2/ }).click()
  await expect(
    diagnostics.getByText('<b>Recorded literal</b>', { exact: true }),
  ).toBeVisible()
  await expect(diagnostics.locator('b')).toHaveCount(0)

  await selector.getByRole('button', { name: 'Inspect selector' }).click()
  const inspector = page.getByRole('dialog', {
    name: 'SelectorTree · Version 3',
  })
  await expect(inspector.getByText(uuid(2))).toBeVisible()
  await inspector.getByRole('button', { name: /Recipe 1/ }).click()
  await inspector.getByRole('button', { name: /Part 1/ }).click()
  await expect(
    inspector.getByText('//p[@class="deadline"]', { exact: true }),
  ).toBeVisible()
  await inspector.getByRole('button', { name: 'Copy locator' }).first().click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    '#deadline',
  )
  await inspector.getByRole('button', { name: /Recipe 2/ }).click()
  await inspector.getByRole('button', { name: /Part 1 Attribute/ }).click()
  await expect(
    inspector.getByText('Extraction spec', { exact: true }),
  ).toBeVisible()
  await inspector.getByRole('button', { name: 'Close' }).click()

  await expect(
    page.getByRole('link', { name: 'Open original website' }),
  ).toHaveAttribute('href', sourceUrl)
  await expect(
    page.getByRole('link', { name: 'Source #7 workflow history' }),
  ).toHaveAttribute('href', '#/tasks/history?source=7')
  await expect(
    page.getByRole('button', { name: 'Open snapshot #16' }),
  ).toBeVisible()
  expect(reviewMethods).toEqual(['GET'])
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
  await expect(
    page.getByRole('heading', { name: 'Tasks by business object' }),
  ).toBeVisible()
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
