import { expect, test } from '@playwright/test'

const uuid = (id) => `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`
const date = '2026-11-24T10:00:00Z'
const object = {
  id: 291,
  name: 'Podmiotowy System Finansowania',
  code: 'PR_POD_001',
  entityId: 4,
  entityName: 'Project',
}
const source = {
  id: 57,
  url: 'https://recruitment.example/',
  name: null,
  state: 'ACTIVE',
}
const otherSource = { ...source, id: 58, url: 'https://funding.example/' }
const snapshot = {
  id: 15,
  source_id: source.id,
  fetched_at: date,
  page_url: source.url,
  mime_type: 'text/html',
}
const capture = {
  id: uuid(104),
  status: 'completed',
  checkedAt: date,
  changeStatus: 'INITIAL_FETCH',
  snapshotId: snapshot.id,
  errorCode: null,
}
const currentCapture = { ...capture, id: uuid(105), snapshotId: 16 }
const paged = (items, total = items.length, offset = 0, limit = 20) => ({
  items,
  total,
  offset,
  limit,
})

function field(id, name, status, check = currentCapture) {
  return {
    businessField: { id, name, type: 'string' },
    businessObjectFieldId: 8000 + id,
    selectorUuid: uuid(id),
    selectorVersionUuid: uuid(check.snapshotId),
    status,
    checkId: check.id,
    checkedAt: check.checkedAt,
    snapshotId: check.snapshotId,
    observationId: 32,
    evaluationId: 43,
  }
}

const historicField = field(12, 'Recruitment deadline', 'FIELD_NEW', capture)
const findings = [
  field(11, 'Project name', 'FIELD_NEW'),
  field(12, 'Recruitment deadline', 'FIELD_CHANGED'),
  field(13, 'Funding amount', 'FIELD_EXTRACTION_FAILED'),
  field(14, 'Project status', 'FIELD_UNCHANGED'),
]

function sourceTask(id, source, fields, status = 'pending') {
  return {
    id,
    type: 'review_business_object',
    title: 'Review business object',
    source,
    fields,
    status,
    workflowStatus: 'active',
    requiresReview: status !== 'completed',
    allowedStatuses:
      status === 'pending'
        ? ['in_progress', 'completed']
        : status === 'in_progress'
          ? ['completed']
          : [],
    originCheckId: capture.id,
    checkedAt: date,
    snapshotId: snapshot.id,
  }
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/business/**', (route) =>
    route.fulfill({ json: paged([]) }),
  )
  await page.route('**/backend/tasks/inbox/count', (route) =>
    route.fulfill({ json: 2 }),
  )
})

test('object inbox pages on the server and opens one review across both sources', async ({
  page,
}) => {
  const reads = []
  const item = {
    object,
    sourceCount: 2,
    taskCount: 2,
    fieldCount: 3,
    status: 'pending',
    severity: 'high',
    lastCheckedAt: date,
  }
  const unnamed = {
    ...item,
    object: { ...object, id: 311, name: null, code: null },
  }
  await page.route('**/backend/monitoring/objects?*', (route) => {
    const args = new URL(route.request().url()).searchParams
    reads.push(args.get('offset'))
    const rows = Number(args.get('offset')) ? [unnamed] : [item]
    return route.fulfill({ json: paged(rows, 21, Number(args.get('offset'))) })
  })
  await page.route('**/backend/monitoring/objects/291/review?*', (route) =>
    route.fulfill({
      json: {
        object,
        tasks: paged([
          sourceTask(155, source, findings),
          sourceTask(156, otherSource, [findings[0]]),
        ]),
      },
    }),
  )
  await page.goto('/#/tasks')
  await expect(
    page.getByRole('heading', { name: 'Tasks by business object' }),
  ).toBeVisible()
  const row = page.getByRole('row').filter({ hasText: object.name })
  await expect(row.getByRole('link', { name: object.name })).toHaveCount(1)
  await expect(row).toContainText('PR_POD_001')
  await expect(row).toContainText('BusinessObject #291')
  await expect(row).toContainText('High')
  await expect(row.getByRole('cell', { name: '3', exact: true })).toBeVisible()
  await expect(row.getByRole('cell', { name: '2', exact: true })).toBeVisible()
  await page.getByTitle('2', { exact: true }).click()
  await expect(
    page.getByRole('link', { name: 'BusinessObject #311' }),
  ).toBeVisible()
  expect(reads.at(-1)).toBe('20')
  await page.getByTitle('1', { exact: true }).click()
  await page.getByRole('link', { name: object.name }).click()
  await expect(page.getByRole('heading', { name: object.name })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'recruitment.example' }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'funding.example' }),
  ).toBeVisible()
  await expect(
    page.getByRole('row', { name: /Recruitment deadline.*Value changed/ }),
  ).toBeVisible()
  await expect(
    page.getByRole('row', { name: /Funding amount.*Extraction failed/ }),
  ).toBeVisible()
  await expect(
    page.getByRole('row', { name: /Project status.*Unchanged/ }),
  ).toBeVisible()
})

test('object finding history uses the captured selector and snapshot and completes only task status', async ({
  page,
  baseURL,
}) => {
  let status = 'pending'
  const writes = []
  page.on('request', (request) => {
    const method = request.method()
    const url = new URL(request.url())
    if (
      url.origin !== baseURL ||
      !['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)
    )
      return
    writes.push({
      method,
      path: url.pathname,
      body: request.postDataJSON(),
    })
  })
  await page.route('**/backend/tasks/155/status', (route) => {
    status = route.request().postDataJSON().status
    return route.fulfill({ json: { id: 155, status } })
  })
  await page.route('**/backend/tasks/155', (route) =>
    route.fulfill({
      json: {
        id: 155,
        workflow_id: 90,
        type: 'review_business_object',
        status,
        title: 'Review business object',
        metadata_json: {
          monitoringJobId: capture.id,
          monitoringKey: 'fixture',
        },
        references: [
          {
            id: 90,
            task_id: 155,
            role: 'target',
            reference_type: 'business_object',
            reference_id: 291,
          },
        ],
        allowed_statuses: ['in_progress'],
      },
    }),
  )
  await page.route('**/backend/monitoring/reviews/155', (route) =>
    route.fulfill({ json: {} }),
  )
  await page.route('**/backend/monitoring/objects/291/review?*', (route) => {
    expect(new URL(route.request().url()).searchParams.get('taskId')).toBe(
      '155',
    )
    return route.fulfill({
      json: {
        object,
        tasks: paged([sourceTask(155, source, findings, status)]),
      },
    })
  })
  await page.route(
    '**/backend/monitoring/object-reviews/155/history?*',
    (route) =>
      route.fulfill({
        json: paged([
          {
            checkId: capture.id,
            checkedAt: date,
            snapshotId: snapshot.id,
            fields: [historicField],
          },
        ]),
      }),
  )
  await page.route('**/backend/monitoring/sources/57/review?*', (route) => {
    expect(new URL(route.request().url()).searchParams.get('checkId')).toBe(
      capture.id,
    )
    return route.fulfill({
      json: {
        id: source.id,
        source,
        selectedCheck: capture,
        latestCompletedCheck: currentCapture,
        latestCheck: currentCapture,
        snapshot,
        earlierTasks: paged([]),
        fields: [
          {
            ...historicField,
            businessObject: object,
            configured: true,
            canonicalValue: 'Canonical deadline',
            canonicalValueId: 901,
            canonicalDisplay: {
              kind: 'string',
              rawValue: 'Canonical deadline',
            },
            currentEvidence: 'Archived original deadline',
            previousEvidence: null,
            task: null,
          },
        ],
      },
    })
  })
  const selectorReads = []
  await page.route(
    `**/backend/monitoring/sources/57/review/${capture.id}/${historicField.selectorUuid}`,
    (route) => {
      selectorReads.push(route.request().url())
      return route.fulfill({
        json: {
          selector: {
            identity: {
              uuid: historicField.selectorUuid,
              target: {
                objectId: String(object.id),
                field: 'Recruitment deadline',
              },
              createdAt: date,
            },
            versionId: 15,
            version: {
              uuid: historicField.selectorVersionUuid,
              versionNo: 1,
              status: 'superseded',
              recipes: [
                {
                  uuid: uuid(50),
                  order: 0,
                  parts: [
                    {
                      uuid: uuid(51),
                      order: 0,
                      extraction: { type: 'text' },
                      locators: [
                        {
                          uuid: uuid(52),
                          order: 0,
                          kind: 'css_path',
                          selector: '#archived-deadline',
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          },
          evaluation: {
            uuid: uuid(43),
            sourceSnapshotId: 15,
            extractionRunId: 35,
            pageUrl: source.url,
            evaluatedAt: date,
            provenance: 'browser_agent_reported',
            result: { status: 'success', recipeResults: [] },
          },
          extractionRunId: 35,
        },
      })
    },
  )
  await page.route(
    '**/backend/monitoring/sources/57/snapshots/15/content?*',
    (route) =>
      route.fulfill({
        json: {
          source,
          snapshot,
          artifact: { mimeType: 'text/html', sizeBytes: 19 },
          html: null,
        },
      }),
  )
  await page.route(
    '**/backend/monitoring/sources/57/snapshots/15/preview',
    (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<h1>Recorded page</h1>',
      }),
  )

  await page.goto('/#/tasks/155')
  await page.getByRole('link', { name: 'Open object review' }).click()
  await expect(page).toHaveURL(/#\/tasks\/objects\/291\?task=155$/)
  await page.getByText('Finding history', { exact: true }).click()
  const oldRow = page.getByRole('row', {
    name: /Recruitment deadline.*Initial evidence/,
  })
  await oldRow.getByRole('button', { name: 'Recruitment deadline' }).click()
  const inspector = page.getByRole('dialog', { name: 'Recruitment deadline' })
  await expect(
    inspector.getByText('Archived original deadline', { exact: true }),
  ).toBeVisible()
  await expect(
    inspector.getByText('Canonical deadline', { exact: true }),
  ).toBeVisible()
  await expect(inspector.getByText('Superseded', { exact: true })).toBeVisible()
  await expect(
    inspector.getByText('#archived-deadline', { exact: true }),
  ).toBeVisible()
  await expect(
    inspector.getByRole('heading', { name: 'Execution diagnostics' }),
  ).toBeVisible()
  await expect(
    inspector.getByRole('link', { name: 'Open source review' }),
  ).toHaveAttribute('href', `#/monitoring/sources/57?check=${capture.id}`)
  expect(selectorReads).toHaveLength(1)
  await inspector
    .getByRole('button', { name: 'Inspect selector', exact: true })
    .click()
  const selector = page.getByRole('dialog', {
    name: 'SelectorTree · Version 1',
  })
  await expect(selector).toBeVisible()
  await selector.getByRole('button', { name: 'Close' }).click()
  await inspector.getByRole('link', { name: 'View snapshot' }).click()
  await expect(
    page.getByRole('heading', { name: 'Snapshot #15' }),
  ).toBeVisible()
  await expect(
    page
      .frameLocator('iframe[title="Snapshot preview"]')
      .getByRole('heading', { name: 'Recorded page' }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Field inspector' }).click()
  await expect(
    inspector.getByText('Archived original deadline', { exact: true }),
  ).toBeVisible()
  await inspector.getByRole('button', { name: 'Close' }).click()

  await page.getByRole('button', { name: 'Start review' }).click()
  await expect(page.getByText('In progress', { exact: true })).toBeVisible()
  await page
    .getByRole('button', { name: 'Complete review', exact: true })
    .click()
  await page
    .getByRole('dialog', { name: 'Complete review #155?' })
    .getByRole('button', { name: 'Complete review', exact: true })
    .click()
  await expect(
    page.getByText('Completed', { exact: true }).first(),
  ).toBeVisible()
  await expect(
    page.getByRole('row', { name: /Recruitment deadline.*Value changed/ }),
  ).toBeVisible()
  expect(writes).toEqual(
    ['in_progress', 'completed'].map((status) => ({
      method: 'PATCH',
      path: '/backend/tasks/155/status',
      body: { status },
    })),
  )
})

test('unbound observations and source failures have direct filtered navigation', async ({
  page,
}) => {
  const requests = []
  await page.route('**/backend/monitoring/objects?*', (route) =>
    route.fulfill({ json: paged([]) }),
  )
  await page.route('**/backend/tasks/inbox?*', (route) => {
    const params = new URL(route.request().url()).searchParams
    requests.push(params.get('type'))
    return route.fulfill({
      json: { ...paged([]), applied_filters: { type: 'resolve_observation' } },
    })
  })
  await page.route('**/backend/monitoring/attention/sources?*', (route) => {
    requests.push(new URL(route.request().url()).searchParams.get('issue'))
    return route.fulfill({ json: paged([]) })
  })
  await page.goto('/#/tasks')
  await page.getByRole('link', { name: 'Unbound observations' }).click()
  await expect(
    page.getByRole('heading', { name: 'Unbound observations' }),
  ).toBeVisible()
  await expect.poll(() => requests.at(-1)).toBe('resolve_observation')
  await page.getByRole('link', { name: 'Source-level issues' }).click()
  await expect.poll(() => requests.at(-1)).toBe('job_failed')
  await page.getByRole('link', { name: 'Objects requiring attention' }).click()
  await expect(
    page.getByRole('heading', { name: 'Tasks by business object' }),
  ).toBeVisible()
})
