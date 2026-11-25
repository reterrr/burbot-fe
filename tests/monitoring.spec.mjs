import { expect, test } from '@playwright/test'

const uuid = (id) => `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`
const date = '2026-11-24T10:00:00Z'
const source = {
  id: 7,
  name: 'Recruitment programme',
  url: 'https://example.org/programme',
  state: 'ACTIVE',
}
const previous = {
  id: uuid(1),
  checkedAt: date,
  status: 'completed',
  changeStatus: 'CONTENT_CHANGED',
  snapshotId: 15,
  errorCode: null,
}
const check = {
  ...previous,
  id: uuid(2),
  changeStatus: 'UNCHANGED',
  snapshotId: 16,
}
const failure = {
  ...check,
  status: 'failed',
  changeStatus: null,
  snapshotId: null,
  errorCode: 'CAPTURE_FAILED',
}
const oldTask = {
  id: 42,
  title: 'Review earlier deadline',
  status: 'pending',
  workflowStatus: 'active',
  originCheckId: previous.id,
  snapshotId: previous.snapshotId,
  checkedAt: date,
  requiresReview: true,
}

function tracked(name, id, status, changes = {}) {
  return {
    selectorUuid: uuid(id),
    selectorVersionId: 12,
    selectorVersionUuid: uuid(12),
    configured: true,
    businessField: { id, name },
    businessObject: { id: 9, name: 'Recruitment' },
    businessObjectFieldId: id,
    status,
    canonicalValueId: 18,
    canonicalValue: '1 December',
    canonicalDisplay: { kind: 'string', rawValue: '1 December' },
    currentEvidence: '15 December',
    previousEvidence: '1 December',
    previousObservationId: 18,
    observationId: 19,
    evaluationId: 21,
    task: null,
    ...changes,
  }
}

function review(fields, changes = {}) {
  return {
    id: source.id,
    source,
    latestCheck: check,
    latestCompletedCheck: check,
    selectedCheck: check,
    snapshot: {
      id: check.snapshotId,
      source_id: source.id,
      fetched_at: date,
      page_url: source.url,
      mime_type: 'text/html',
    },
    fields,
    earlierTasks: { items: [oldTask], total: 1, limit: 20, offset: 0 },
    ...changes,
  }
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/business/**', (route) =>
    route.fulfill({ json: { items: [], total: 0, offset: 0, limit: 20 } }),
  )
  await page.route('**/backend/tasks/inbox/count', (route) =>
    route.fulfill({ json: 2 }),
  )
})

test('Attention uses server filters, pages grouped sources, and refreshes', async ({
  page,
}) => {
  const requests = []
  let fail = false
  const summary = {
    ...source,
    lastCheck: check,
    reason: 'field_problems',
    severity: 'high',
    counts: {
      changed: 0,
      missing: 1,
      extractionFailed: 0,
      ambiguous: 0,
      conflict: 0,
      initial: 0,
      unchanged: 4,
      problems: 1,
    },
    openTaskCount: 2,
  }
  const all = [
    summary,
    ...Array.from({ length: 20 }, (_, index) => ({
      ...summary,
      id: 8 + index,
      name: `Other programme ${index + 1}`,
    })),
  ]
  await page.route('**/backend/monitoring/attention/sources?*', (route) => {
    const params = new URL(route.request().url()).searchParams
    requests.push(Object.fromEntries(params))
    if (fail) return route.fulfill({ status: 503 })
    const offset = Number(params.get('offset'))
    const limit = Number(params.get('limit'))
    const matches = params.get('search') ? [] : all
    return route.fulfill({
      json: {
        items: matches.slice(offset, offset + limit),
        total: matches.length,
        offset,
        limit,
      },
    })
  })
  await page.goto('/#/models')
  await page.getByRole('link', { name: 'Monitoring', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Sources requiring attention' }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: source.name })).toHaveCount(1)
  await expect(page.getByText('2 open tasks').first()).toBeVisible()
  await expect(page.getByText('1 problem field').first()).toBeVisible()
  await page.getByTitle('2', { exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Other programme 20' }),
  ).toBeVisible()
  expect(requests.at(-1).offset).toBe('20')
  await page.getByLabel('Search sources').fill('missing.example')
  await page.getByRole('combobox', { name: 'Problem type' }).click()
  await page.getByRole('option', { name: 'Value missing' }).click()
  await page.getByTitle('Priority', { exact: true }).click()
  await page.getByRole('option', { name: 'Last checked' }).click()
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(page.getByText('No sources match these filters')).toBeVisible()
  expect(requests.at(-1)).toMatchObject({
    search: 'missing.example',
    issue: 'missing',
    sort: 'last_checked',
    offset: '0',
  })
  fail = true
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(
    page.getByText('Could not load monitoring sources'),
  ).toBeVisible()
  fail = false
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(page.getByText('No sources match these filters')).toBeVisible()
})

test('Source review opens a historical selector lazily and links to Tasks', async ({
  page,
}) => {
  const locator = {
    uuid: uuid(70),
    order: 0,
    kind: 'css_path',
    selector: '.funding .percentage',
  }
  const part = {
    uuid: uuid(71),
    order: 0,
    extraction: { type: 'text' },
    locators: [locator],
  }
  const recipe = { uuid: uuid(72), order: 0, parts: [part] }
  const field = tracked('Funding amount', 8, 'FIELD_MISSING', {
    canonicalValue: '80%',
    currentEvidence: null,
    task: oldTask,
  })
  let detailRequests = 0
  let sourceReads = 0
  let completed = false
  await page.route('**/backend/monitoring/sources/7/review?*', (route) => {
    sourceReads += 1
    return route.fulfill({
      json: review(
        [
          field,
          tracked('Recruitment status', 9, 'FIELD_UNCHANGED'),
          tracked('Unchecked rule', 10, null, { currentEvidence: null }),
        ],
        completed
          ? { earlierTasks: { items: [], total: 0, limit: 20, offset: 0 } }
          : {},
      ),
    })
  })
  await page.route(
    `**/backend/monitoring/sources/7/review/${check.id}/${field.selectorUuid}`,
    (route) => {
      detailRequests += 1
      return route.fulfill({
        json: {
          extractionRunId: 24,
          selector: {
            identity: {
              uuid: field.selectorUuid,
              target: { objectId: 'Recruitment', field: 'Funding amount' },
              createdAt: date,
            },
            versionId: 12,
            version: {
              uuid: uuid(12),
              selectorUuid: field.selectorUuid,
              versionNo: 3,
              status: 'superseded',
              createdAt: date,
              recipes: [recipe],
            },
          },
          evaluation: {
            uuid: uuid(13),
            evaluatedAt: date,
            pageUrl: source.url,
            sourceSnapshotId: 16,
            extractionRunId: 24,
            provenance: 'browser_agent_reported',
            result: {
              status: 'not_found',
              selectorVersionUuid: uuid(12),
              recipeResults: [
                {
                  recipeUuid: recipe.uuid,
                  status: 'not_found',
                  partResults: [
                    {
                      partUuid: part.uuid,
                      status: 'not_found',
                      locatorResults: [
                        {
                          locatorUuid: locator.uuid,
                          status: 'not_found',
                          matchCount: 0,
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        },
      })
    },
  )
  const task = () => ({
    id: oldTask.id,
    title: oldTask.title,
    status: completed ? 'completed' : 'pending',
    workflow_id: 9,
    type: 'review_source_change',
    reason: 'manual',
    metadata_json: {
      monitoringJobId: previous.id,
      evidenceStatus: 'INITIAL_EVIDENCE',
    },
    allowed_statuses: completed ? [] : ['completed'],
    references: [
      {
        id: 1,
        task_id: oldTask.id,
        role: 'context',
        reference_type: 'source',
        reference_id: source.id,
      },
    ],
  })
  await page.route('**/backend/tasks/42', (route) =>
    route.fulfill({ json: task() }),
  )
  await page.route('**/backend/tasks/42/status', (route) => {
    expect(route.request().postDataJSON()).toEqual({ status: 'completed' })
    completed = true
    return route.fulfill({ json: task() })
  })
  await page.goto('/#/monitoring/sources/7')
  await expect(page.getByRole('heading', { name: source.name })).toBeVisible()
  await expect(
    page.getByRole('row').filter({ hasText: 'Recruitment status' }),
  ).toContainText('Unchanged')
  await expect(
    page.getByRole('row').filter({ hasText: 'Unchecked rule' }),
  ).toContainText('Not checked')
  await expect(
    page.getByRole('row').filter({ hasText: 'Funding amount' }),
  ).toContainText('Earlier task open')
  expect(detailRequests).toBe(0)
  await expect(
    page.getByRole('link', { name: 'Open original website' }),
  ).toHaveAttribute('href', source.url)
  await page
    .getByRole('button', { name: 'Funding amount', exact: true })
    .click()
  const inspector = page.getByRole('dialog', {
    name: 'Funding amount',
    exact: true,
  })
  await expect(inspector.getByText('Version 3', { exact: true })).toBeVisible()
  expect(detailRequests).toBe(1)
  await expect(inspector.getByText('Superseded', { exact: true })).toBeVisible()
  await expect(inspector.getByText('80%', { exact: true })).toBeVisible()
  const diagnostics = inspector.getByRole('region', {
    name: 'Execution diagnostics',
  })
  await diagnostics.getByRole('button', { name: /Recipe 1/ }).click()
  await diagnostics.getByRole('button', { name: /Part 1/ }).click()
  await expect(
    diagnostics.getByText('0 matches · No element found'),
  ).toBeVisible()
  await inspector.getByRole('link', { name: 'Open task #42' }).click()
  await expect(
    page.getByText('Monitoring review', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Complete', exact: true }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Complete', exact: true })
    .click()
  await expect(page.getByText('Task #42 · Completed')).toBeVisible()
  await page
    .getByRole('link', { name: 'Open source review', exact: true })
    .click()
  await expect(
    page.getByText('No open tasks from earlier checks'),
  ).toBeVisible()
  expect(sourceReads).toBeGreaterThan(1)
  await expect(
    page.getByRole('row').filter({ hasText: 'Funding amount' }),
  ).toContainText('80%')
})

test('Initial evidence explains matching and differing canonical text', async ({
  page,
}) => {
  const fields = [
    tracked('Matching deadline', 8, 'FIELD_NEW', {
      currentEvidence: '1 December',
      previousEvidence: null,
    }),
    tracked('Different deadline', 9, 'FIELD_NEW', {
      currentEvidence: 'December '.repeat(180),
      previousEvidence: null,
    }),
    tracked('No canonical funding', 10, 'FIELD_NEW', {
      canonicalValueId: null,
      canonicalValue: null,
      canonicalDisplay: null,
      previousEvidence: null,
    }),
  ]
  await page.route('**/backend/monitoring/sources/7/review?*', (route) =>
    route.fulfill({ json: review(fields) }),
  )
  await page.route(
    `**/backend/monitoring/sources/7/review/${check.id}/*`,
    (route) => route.fulfill({ json: { selector: null, evaluation: null } }),
  )
  for (const [field, message] of [
    [fields[0], 'Recorded evidence matches the canonical value.'],
    [fields[1], 'Recorded evidence differs from the canonical value.'],
    [fields[2], 'No canonical value is available for comparison.'],
  ]) {
    await page.goto('/#/monitoring/sources/7')
    await page
      .getByRole('button', { name: field.businessField.name, exact: true })
      .click()
    const drawer = page.getByRole('dialog', { name: field.businessField.name })
    await expect(
      drawer.getByText('First observation — no previous baseline'),
    ).toBeVisible()
    await expect(drawer.getByText(message, { exact: true })).toBeVisible()
    await expect(
      drawer.getByText('Diagnostics unavailable for this capture'),
    ).toBeVisible()
    await drawer.getByRole('button', { name: 'Close' }).click()
  }
})

test.describe('Typed canonical values', () => {
  test.use({ locale: 'pl-PL', timezoneId: 'Europe/Warsaw' })

  test('Task #155 and Source Review show the same readable reference', async ({
    page,
  }) => {
    const name =
      'Podmiotowy System Finansowania - realizacja usług rozwojowych w województwie podlaskim 2024 - 2029'
    const observed = 'Podmiotowy System Finansowania'
    const projectSource = {
      id: 572,
      url: 'https://wupbialystok.praca.gov.pl/projects',
      name: null,
      state: 'ACTIVE',
    }
    const capture = { ...check, snapshotId: 268, extractionRunId: 71 }
    const snapshot = {
      id: 268,
      source_id: 572,
      page_url: projectSource.url,
      fetched_at: date,
      mime_type: 'text/html',
    }
    const field = tracked('Projekt', 271, 'FIELD_NEW', {
      businessField: {
        id: 271,
        name: 'Projekt',
        persistentKey: 'project_id',
        kind: 'reference',
        referenceEntity: { id: 68, name: 'Project' },
      },
      businessObjectFieldId: 8608,
      canonicalValueId: 3639,
      canonicalValue: 291,
      canonicalDisplay: {
        kind: 'reference',
        label: name,
        labelBasis: 'current',
        rawValue: 291,
        resolved: true,
        target: { type: 'business_object', id: 291, entityId: 68 },
      },
      observationId: 150,
      currentEvidence: observed,
      previousObservationId: null,
      previousEvidence: null,
    })
    const references = [
      ['source', 572],
      ['source_snapshot', 268],
      ['extraction_run', 71],
      ['observation', 150],
      ['business_field', 271],
      ['business_object_field', 8608],
    ].map(([reference_type, reference_id], id) => ({
      id,
      reference_type,
      reference_id,
      role: 'context',
    }))
    const versionUuid = uuid(12)
    const inspection = {
      extractionRunId: 71,
      selector: {
        identity: {
          uuid: field.selectorUuid,
          target: { objectId: 'project', field: 'project_id' },
          createdAt: date,
        },
        versionId: 12,
        version: {
          uuid: versionUuid,
          selectorUuid: field.selectorUuid,
          status: 'active',
          versionNo: 1,
          createdAt: date,
          recipes: [],
        },
      },
      evaluation: {
        uuid: uuid(13),
        pageUrl: projectSource.url,
        evaluatedAt: date,
        sourceSnapshotId: 268,
        extractionRunId: 71,
        provenance: 'browser_agent_reported',
        result: {
          status: 'success',
          selectorVersionUuid: versionUuid,
          rawValue: observed,
          recipeResults: [],
        },
      },
    }
    const taskReview = {
      taskId: 155,
      ...field,
      ...inspection,
      source: projectSource,
      snapshot,
      taskStatus: 'pending',
      requiresReview: true,
      evidenceStatus: 'INITIAL_EVIDENCE',
      referenceDisplays: {
        0: { label: projectSource.url },
        1: { capturedAt: date },
        2: { status: 'succeeded' },
        3: { label: observed },
        4: { label: 'Projekt' },
        5: { label: 'Projekt · Recruitment' },
      },
    }
    await page.route('**/backend/tasks/155', (route) =>
      route.fulfill({
        json: {
          id: 155,
          workflow_id: 3,
          title: 'Review initial evidence',
          type: 'review_source_change',
          status: 'pending',
          created_at: date,
          references,
          metadata_json: { monitoringJobId: capture.id },
          allowed_statuses: ['in_progress', 'completed'],
        },
      }),
    )
    await page.route('**/backend/monitoring/reviews/155', (route) =>
      route.fulfill({ json: taskReview }),
    )
    await page.route('**/backend/monitoring/sources/572/review?*', (route) =>
      route.fulfill({
        json: review([field], {
          id: 572,
          source: projectSource,
          latestCheck: capture,
          latestCompletedCheck: capture,
          selectedCheck: capture,
          snapshot,
        }),
      }),
    )
    await page.route(
      `**/backend/monitoring/sources/572/review/${capture.id}/${field.selectorUuid}`,
      (route) => route.fulfill({ json: inspection }),
    )

    await page.goto('/#/tasks/155')
    const taskReferences = page.locator('.task-references')
    await expect(
      taskReferences.getByRole('link', { name: 'wupbialystok.praca.gov.pl' }),
    ).toBeVisible()
    await expect(taskReferences.getByText('Captured')).toBeVisible()
    await expect(taskReferences.getByText('Succeeded')).toBeVisible()
    await expect(
      taskReferences.getByText(observed, { exact: true }),
    ).toBeVisible()
    await expect(
      taskReferences.getByText('Projekt · Recruitment'),
    ).toBeVisible()
    await page.getByRole('link', { name: 'Open evidence review' }).click()
    const evidence = page.getByTestId('evidence-comparison')
    await expect(
      evidence.getByText('reference → Project', { exact: true }),
    ).toBeVisible()
    await expect(evidence.getByText(name, { exact: true })).toBeVisible()
    await expect(
      evidence.getByText('BusinessObject #291', { exact: true }),
    ).toBeVisible()
    await expect(
      evidence.getByText('Value record #3639', { exact: true }),
    ).toBeVisible()
    await expect(
      evidence.getByText(observed, { exact: true }).first(),
    ).toBeVisible()
    await expect(
      evidence.getByText('Reference resolved successfully.'),
    ).toBeVisible()
    await expect(
      evidence.getByText('Evidence has not yet been semantically validated.'),
    ).toBeVisible()
    await expect(
      evidence.getByText('Recorded evidence matches', { exact: false }),
    ).toHaveCount(0)
    await expect(evidence.getByText('Success', { exact: true })).toBeVisible()
    await expect(
      evidence.getByRole('button', { name: 'Inspect selector', exact: true }),
    ).toBeVisible()

    await page.goto('/#/monitoring/sources/572')
    const row = page.getByRole('row').filter({ hasText: 'Projekt' })
    await expect(row.getByText(name, { exact: true })).toBeVisible()
    await expect(row.getByText('Current name', { exact: true })).toBeVisible()
    await row.getByRole('button', { name: 'Projekt' }).click()
    const inspector = page.getByRole('dialog', { name: 'Projekt' })
    await expect(inspector.getByText(name, { exact: true })).toBeVisible()
    await expect(
      inspector.getByText(observed, { exact: true }).first(),
    ).toBeVisible()
    await expect(
      inspector.getByText('Evidence has not yet been semantically validated.'),
    ).toBeVisible()
  })

  test('renders typed scalars, lists, and fallbacks without resolving raw evidence', async ({
    page,
  }) => {
    const listItems = ['Yes', 'No'].map((_, index) => ({
      kind: 'boolean',
      rawValue: index === 0,
    }))
    const data = [
      ['Integer', 291, { kind: 'integer' }, '291'],
      [
        'BigInteger',
        Number(9_223_372_036_854_775_807n),
        { kind: 'biginteger', label: '9223372036854775807' },
        /9\s223\s372\s036\s854\s775\s807/,
      ],
      ['String', 'Project label', { kind: 'string' }, 'Project label'],
      ['Float', 1234.56789, { kind: 'float' }, '1234,56789'],
      [
        'Decimal',
        '9007199254740993.12345',
        { kind: 'decimal' },
        /9\s007\s199\s254\s740\s993,12345/,
      ],
      ['Boolean', false, { kind: 'boolean' }, 'No'],
      ['Date', '2026-11-25', { kind: 'date' }, '25.11.2026'],
      [
        'Datetime',
        '2026-11-24T15:05:00Z',
        { kind: 'datetime' },
        /24 lis 2026.*16:05/,
      ],
      [
        'List',
        [true, false],
        { kind: 'list', itemKind: 'boolean', items: listItems },
        /Yes.*No/,
      ],
      [
        'Source',
        291,
        {
          kind: 'source',
          label: 'https://example.org/291',
          labelBasis: 'current',
          resolved: true,
          target: { type: 'source', id: 291 },
        },
        'https://example.org/291',
      ],
      [
        'Missing project',
        291,
        {
          kind: 'reference',
          label: 'BusinessObject #291',
          resolved: false,
          target: { type: 'business_object', id: 291 },
        },
        'BusinessObject #291',
      ],
      ['Null', null, { kind: 'unknown' }, 'Null value'],
      ['Unknown', { extra: ['ok'] }, { kind: 'new-type' }, /"extra":\["ok"\]/],
    ]
    const fields = data.map(([title, value, display], index) =>
      tracked(title, index + 8, 'FIELD_NEW', {
        canonicalValue: value,
        canonicalDisplay: { ...display, rawValue: value },
        currentEvidence: '291',
        previousEvidence: null,
      }),
    )
    await page.route('**/backend/monitoring/sources/7/review?*', (route) =>
      route.fulfill({ json: review(fields) }),
    )
    await page.route(
      `**/backend/monitoring/sources/7/review/${check.id}/*`,
      (route) => route.fulfill({ json: { selector: null, evaluation: null } }),
    )
    await page.goto('/#/monitoring/sources/7')
    for (const [title, , , expected] of data) {
      const row = page
        .getByRole('row')
        .filter({ has: page.getByRole('button', { name: title, exact: true }) })
      await expect(row.getByRole('cell').nth(1)).toContainText(expected)
      await expect(row.getByRole('cell').nth(2)).toHaveText('291')
    }
    await page.getByRole('button', { name: 'Missing project' }).click()
    const inspector = page.getByRole('dialog', { name: 'Missing project' })
    await expect(
      inspector.getByText('Referenced business object could not be resolved.'),
    ).toBeVisible()
    await expect(
      inspector.getByText('Recorded evidence matches', { exact: false }),
    ).toHaveCount(0)
  })
})

test('Failed checks stay distinct from the latest completed snapshot', async ({
  page,
}) => {
  const selected = []
  await page.route('**/backend/monitoring/sources/7/review?*', (route) => {
    const checkId = new URL(route.request().url()).searchParams.get('checkId')
    selected.push(checkId)
    return route.fulfill({
      json: review([], {
        latestCheck: failure,
        latestCompletedCheck: previous,
        selectedCheck: checkId ? previous : failure,
        snapshot: checkId ? { ...review([]).snapshot, id: 15 } : null,
      }),
    })
  })
  await page.route(
    '**/backend/monitoring/sources/7/history?summary=true*',
    (route) => route.fulfill({ json: [failure, previous] }),
  )
  await page.goto('/#/monitoring/sources/7')
  await expect(
    page.getByText('Monitoring check failed', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('No tracked fields', { exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'View snapshot' })).toHaveCount(
    0,
  )
  await page.getByRole('button', { name: 'Monitoring history' }).click()
  await page
    .getByRole('dialog', { name: 'Monitoring history' })
    .getByRole('button', { name: 'Review check' })
    .nth(1)
    .click()
  await expect(page.getByText(/Historical check from/)).toBeVisible()
  expect(selected.at(-1)).toBe(previous.id)
  await page.getByRole('button', { name: 'View snapshot' }).click()
  const snapshot = page.getByRole('dialog', { name: 'Source snapshot #15' })
  await expect(snapshot).toBeVisible()
  await expect(snapshot.locator('iframe, script')).toHaveCount(0)
})
